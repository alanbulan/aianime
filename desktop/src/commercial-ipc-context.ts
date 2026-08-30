// Copyright (c) 2026 AI anime

import type { CommercialDeviceSigner } from "./commercial-device.js";
import type {
  ByokModelAssignment,
  EncryptedFileCommercialModelAccessStore,
  StoredCommercialModelAccess,
} from "./commercial-model-access.js";
import {
  authorizationDeviceId,
  projectCommercialAuthorization,
  projectCommercialModelCatalog,
  type CommercialAuthorizationSnapshot,
  type CommercialModelCapabilitySnapshot,
} from "./commercial-contracts.js";
import {
  CommercialApiClient,
  CommercialApiError,
  type CommercialSessionSummary,
} from "./commercial-api-client.js";
import {
  authorizationAllowsByok,
  mergeModelCapabilities,
  updateExplicitCloudModelAssignments,
  updateCloudModelAssignments,
  verifyAuthorizationLease,
} from "./commercial-ipc-support.js";
import type {
  COMMERCIAL_CHANNELS,
  IpcMainLike,
} from "./commercial-ipc.js";

export interface RegisterCommercialIpcOptions {
  ipcMain: IpcMainLike;
  client: CommercialApiClient;
  deviceIdentity: CommercialDeviceSigner;
  modelAccessStore: EncryptedFileCommercialModelAccessStore;
  deviceName: string;
  platform: string;
  arch: string;
  clientVersion: string;
  isAllowedSender: (
    senderId: number,
    senderFrame?: unknown,
    senderMainFrame?: unknown,
  ) => boolean;
  onAuthenticated: (session: CommercialSessionSummary) => void | Promise<void>;
  onModelAccessChanged: (
    access: StoredCommercialModelAccess,
    allowsCustomModels: boolean,
    cloudModelAssignments: readonly ByokModelAssignment[],
    modelCapabilities: readonly CommercialModelCapabilitySnapshot[],
    explicitCloudModelAssignments: readonly ByokModelAssignment[],
  ) => void | Promise<void>;
  onLoggedOut: () => void | Promise<void>;
  releaseUpdater?: {
    download(artifactId: string | number): Promise<{ version: string }>;
    install(): void;
  };
  saveInvocationResult?: (
    id: string | number,
  ) => Promise<{ saved: boolean; fileName?: string }>;
  /**
   * keyId -> PEM SPKI public keys for offline lease verification. When empty,
   * every lease stays `verifiedOffline: false` (fail-closed).
   */
  leaseSigningKeys?: Record<string, string>;
  devicePublicKeyHash?: string;
}

type CommercialIpcChannels = typeof COMMERCIAL_CHANNELS;

export class CommercialIpcContext {
  readonly client: CommercialApiClient;
  currentAuthorization: CommercialAuthorizationSnapshot | null = null;
  cloudModelAssignments: ByokModelAssignment[] = [];
  explicitCloudModelAssignments: ByokModelAssignment[] = [];

  private readonly modelCapabilities = new Map<
    string,
    CommercialModelCapabilitySnapshot
  >();
  private modelCapabilityCatalogVersion = "";
  private modelAccessHydrated = false;
  private modelAccessHydration: Promise<void> | null = null;
  private modelAccessSyncChain: Promise<void> = Promise.resolve();
  private modelAccessFallbackWarningShown = false;

  constructor(
    readonly options: RegisterCommercialIpcOptions,
    readonly channels: CommercialIpcChannels,
    private readonly errorPrefix: string,
  ) {
    this.client = options.client;
  }

  handle(channel: string, listener: (input: unknown) => unknown): void {
    this.options.ipcMain.removeHandler?.(channel);
    this.options.ipcMain.handle(channel, async (event, input) => {
      try {
        if (!this.options.isAllowedSender(
          event.sender.id,
          event.senderFrame,
          event.sender.mainFrame,
        )) {
          throw new CommercialApiError(
            "拒绝非主窗口的 Commercial Gateway 调用",
            { status: 403, code: "IPC_SENDER_FORBIDDEN" },
          );
        }
        return await listener(input);
      } catch (error) {
        if (error instanceof CommercialApiError) {
          throw new Error(
            `${this.errorPrefix}${JSON.stringify({
              message: error.message,
              status: error.status,
              code: error.code,
              requestId: error.requestId,
            })}`,
          );
        }
        throw error;
      }
    });
  }

  resetModelState(): void {
    this.currentAuthorization = null;
    this.cloudModelAssignments = [];
    this.explicitCloudModelAssignments = [];
    this.modelCapabilities.clear();
    this.modelCapabilityCatalogVersion = "";
    this.modelAccessHydrated = false;
    this.modelAccessHydration = null;
  }

  async prepareAuthentication(): Promise<void> {
    this.resetModelState();
    await this.synchronizeModelAccess();
  }

  async authenticate(
    login: () => Promise<CommercialSessionSummary>,
  ): Promise<CommercialSessionSummary> {
    await this.prepareAuthentication();
    const session = await login();
    try {
      await this.options.onAuthenticated(session);
      await this.hydrateModelAccess();
    } catch (error) {
      await this.client.logout();
      throw error;
    }
    return session;
  }

  async clearAuthenticatedState(): Promise<void> {
    await this.options.onLoggedOut();
    this.resetModelState();
    await this.synchronizeModelAccess();
  }

  async loadModelAccessForRouting(): Promise<StoredCommercialModelAccess> {
    try {
      return await this.options.modelAccessStore.load();
    } catch (error) {
      if (!this.modelAccessFallbackWarningShown) {
        this.modelAccessFallbackWarningShown = true;
        console.warn(
          "[commercial] local BYOK storage unavailable; continuing with cloud models:",
          error instanceof Error ? error.message : String(error),
        );
      }
      return {
        schemaVersion: 5,
        cloudModelAssignments: [],
        byokProviders: [],
      };
    }
  }

  updateModelCapabilities(
    catalog: ReturnType<typeof projectCommercialModelCatalog> | null,
    requestedOperation?: string,
  ): void {
    if (!catalog) return;
    if (catalog.catalogVersion !== this.modelCapabilityCatalogVersion) {
      this.modelCapabilities.clear();
      this.explicitCloudModelAssignments = [];
      this.modelCapabilityCatalogVersion = catalog.catalogVersion;
    }
    mergeModelCapabilities(catalog, this.modelCapabilities);
    this.explicitCloudModelAssignments = updateExplicitCloudModelAssignments(
      this.explicitCloudModelAssignments,
      catalog,
      requestedOperation,
    );
  }

  async loadCurrentLicense(): Promise<unknown> {
    const device = await this.options.deviceIdentity.summary();
    return this.client.currentLicense(device.publicKeyHash);
  }

  async publishAuthorization(
    value: unknown,
  ): Promise<CommercialAuthorizationSnapshot> {
    const authorization = projectCommercialAuthorization(value);
    this.currentAuthorization = verifyAuthorizationLease(
      value,
      authorization,
      this.options,
    );
    await this.synchronizeModelAccess();
    return this.currentAuthorization;
  }

  async ensureCurrentAuthorization(): Promise<CommercialAuthorizationSnapshot> {
    return this.currentAuthorization
      ?? this.publishAuthorization(await this.loadCurrentLicense());
  }

  /** Serialize proxy and sidecar model-access updates so the latest state wins. */
  synchronizeModelAccess(): Promise<void> {
    const run = this.modelAccessSyncChain.then(
      () => this.applyModelAccess(),
      () => this.applyModelAccess(),
    );
    this.modelAccessSyncChain = run.catch(() => undefined);
    return run;
  }

  async hydrateModelAccess(): Promise<void> {
    if (this.modelAccessHydrated) return;
    if (this.modelAccessHydration) return this.modelAccessHydration;
    this.modelAccessHydration = (async () => {
      try {
        const authorization = await this.ensureCurrentAuthorization();
        const access = await this.loadModelAccessForRouting();
        this.cloudModelAssignments = [...(access.cloudModelAssignments ?? [])];
        const catalog = projectCommercialModelCatalog(
          await this.client.modelCatalog(
            {},
            authorizationDeviceId(authorization),
          ),
        );
        this.updateModelCapabilities(catalog);
        this.cloudModelAssignments = updateCloudModelAssignments(
          this.cloudModelAssignments,
          catalog,
        );
        await this.synchronizeModelAccess();
        this.modelAccessHydrated = true;
      } catch (error) {
        await this.synchronizeModelAccess();
        console.warn(
          "[commercial] model access initialization failed:",
          error instanceof Error ? error.message : String(error),
        );
      }
    })();
    try {
      await this.modelAccessHydration;
    } finally {
      this.modelAccessHydration = null;
    }
  }

  private async applyModelAccess(): Promise<void> {
    const access = await this.loadModelAccessForRouting();
    await this.options.onModelAccessChanged(
      access,
      authorizationAllowsByok(this.currentAuthorization),
      this.cloudModelAssignments,
      [...this.modelCapabilities.values()],
      this.explicitCloudModelAssignments,
    );
  }
}
