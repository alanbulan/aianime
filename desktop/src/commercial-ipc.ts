// Copyright (c) 2026 AI anime

import { verifyOfflineLease } from "./commercial-lease.js";
import type { CommercialDeviceSigner } from "./commercial-device.js";
import {
  fetchByokModelCatalog,
  type ByokModelAssignment,
  type CommercialModelAccessStatus,
  type EncryptedFileCommercialModelAccessStore,
  type StoredCommercialModelAccess,
} from "./commercial-model-access.js";
import {
  authorizationActivationId,
  authorizationLicenseId,
  projectCommercialAuthorization,
  projectCommercialBootstrap,
  projectCommercialModelCatalog,
  projectCommercialQuota,
  selectReleaseArtifactId,
  type CommercialArtifactDownloadSnapshot,
  type CommercialAuthorizationSnapshot,
  type CommercialModelCapabilitySnapshot,
} from "./commercial-contracts.js";
import {
  CommercialApiClient,
  CommercialApiError,
  optionalRecord,
  optionalText,
  requiredIdentifier,
  requiredInteger,
  requiredRecord,
  requiredText,
  type CommercialBootstrapQuery,
  type CommercialLoginInput,
  type CommercialModelCatalogQuery,
  type CommercialSessionSummary,
} from "./commercial-api-client.js";

export interface CommercialInstallArtifactInput {
  filePath: string;
  sha256: string;
}

export interface IpcInvokeEventLike {
  sender: { id: number };
}

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, input?: unknown) => unknown,
  ): void;
  removeHandler?(channel: string): void;
}

export const COMMERCIAL_CHANNELS = {
  status: "desktop:commercial:status",
  publicConfig: "desktop:commercial:public-config",
  publicLogo: "desktop:commercial:public-logo",
  publicCaptcha: "desktop:commercial:public-captcha",
  session: "desktop:commercial:session",
  login: "desktop:commercial:login",
  logout: "desktop:commercial:logout",
  bootstrap: "desktop:commercial:bootstrap",
  quotaBalance: "desktop:commercial:quota-balance",
  modelCatalog: "desktop:commercial:model-catalog",
  announcements: "desktop:commercial:announcements",
  checkRelease: "desktop:commercial:check-release",
  downloadArtifact: "desktop:commercial:download-artifact",
  installArtifact: "desktop:commercial:install-artifact",
  currentLicense: "desktop:commercial:current-license",
  activateLicense: "desktop:commercial:activate-license",
  refreshLicenseLease: "desktop:commercial:refresh-license-lease",
  modelAccessStatus: "desktop:commercial:model-access-status",
  configureByok: "desktop:commercial:configure-byok",
  selectCloudModels: "desktop:commercial:select-cloud-models",
  clearByok: "desktop:commercial:clear-byok",
} as const;

interface RegisterCommercialIpcOptions {
  ipcMain: IpcMainLike;
  client: CommercialApiClient | null;
  deviceIdentity: CommercialDeviceSigner;
  modelAccessStore: EncryptedFileCommercialModelAccessStore;
  deviceName: string;
  platform: string;
  arch: string;
  clientVersion: string;
  isAllowedSender: (senderId: number) => boolean;
  onAuthenticated: (session: CommercialSessionSummary) => void | Promise<void>;
  onModelAccessChanged: (
    access: StoredCommercialModelAccess,
    allowsCustomModels: boolean,
    cloudModelAssignments: readonly ByokModelAssignment[],
    modelCapabilities: readonly CommercialModelCapabilitySnapshot[],
  ) => void | Promise<void>;
  onLoggedOut: () => void | Promise<void>;
  releaseArtifactDownloader?: (
    metadata: CommercialArtifactDownloadSnapshot,
  ) => Promise<{
    filePath: string;
    fileName: string;
    sizeBytes: number;
    sha256: string;
  }>;
  installArtifact?: (
    input: CommercialInstallArtifactInput,
  ) => Promise<void>;
  /**
   * keyId -> PEM SPKI public keys for offline lease verification. When empty,
   * every lease stays `verifiedOffline: false` (fail-closed).
   */
  leaseSigningKeys?: Record<string, string>;
  devicePublicKeyHash?: string;
}

export function registerCommercialIpc(
  options: RegisterCommercialIpcOptions,
): CommercialApiClient | null {
  const client = options.client;
  let currentAuthorization: CommercialAuthorizationSnapshot | null = null;
  let cloudModelAssignments: ByokModelAssignment[] = [];
  const modelCapabilities = new Map<string, CommercialModelCapabilitySnapshot>();
  let modelCapabilityCatalogVersion = "";

  const updateModelCapabilities = (
    catalog: ReturnType<typeof projectCommercialModelCatalog> | null,
  ): void => {
    if (!catalog) return;
    if (catalog.catalogVersion !== modelCapabilityCatalogVersion) {
      modelCapabilities.clear();
      modelCapabilityCatalogVersion = catalog.catalogVersion;
    }
    mergeModelCapabilities(catalog, modelCapabilities);
  };

  const requireClient = (): CommercialApiClient => {
    if (!client) throw new CommercialApiError("未配置 Commercial Gateway 地址");
    return client;
  };
  const handle = (
    channel: string,
    listener: (input: unknown) => unknown,
  ): void => {
    options.ipcMain.removeHandler?.(channel);
    options.ipcMain.handle(channel, (event, input) => {
      if (!options.isAllowedSender(event.sender.id)) {
        throw new CommercialApiError("拒绝非主窗口的 Commercial Gateway 调用");
      }
      return listener(input);
    });
  };

  handle(COMMERCIAL_CHANNELS.status, () => ({
    configured: client !== null,
    gatewayOrigin: client?.baseUrl ?? "",
  }));
  handle(COMMERCIAL_CHANNELS.publicConfig, (input) =>
    requireClient().publicConfig(requiredText(input, "tenantCode")),
  );
  handle(COMMERCIAL_CHANNELS.publicLogo, (input) =>
    requireClient().publicLogo(requiredText(input, "tenantCode")),
  );
  handle(COMMERCIAL_CHANNELS.publicCaptcha, (input) =>
    requireClient().publicCaptcha(requiredText(input, "tenantCode")),
  );
  handle(COMMERCIAL_CHANNELS.session, async () => {
    currentAuthorization = null;
    cloudModelAssignments = [];
    modelCapabilities.clear();
    modelCapabilityCatalogVersion = "";
    const session = await requireClient().restoreSession();
    if (session) await options.onAuthenticated(session);
    else await options.onLoggedOut();
    return session;
  });
  handle(COMMERCIAL_CHANNELS.login, async (input) => {
    currentAuthorization = null;
    cloudModelAssignments = [];
    modelCapabilities.clear();
    modelCapabilityCatalogVersion = "";
    await synchronizeModelAccess();
    const session = await requireClient().login(parseLoginInput(input));
    try {
      await options.onAuthenticated(session);
    } catch (error) {
      await requireClient().logout();
      throw error;
    }
    return session;
  });
  handle(COMMERCIAL_CHANNELS.logout, async () => {
    const result = client ? await client.logout() : { remoteRevoked: false };
    await options.onLoggedOut();
    currentAuthorization = null;
    cloudModelAssignments = [];
    modelCapabilities.clear();
    modelCapabilityCatalogVersion = "";
    await synchronizeModelAccess();
    return result;
  });
  const loadCurrentLicense = async (): Promise<unknown> => {
    const device = await options.deviceIdentity.summary();
    return requireClient().currentLicense(device.publicKeyHash);
  };
  const publishAuthorization = async (
    value: unknown,
  ): Promise<CommercialAuthorizationSnapshot> => {
    const authorization = projectCommercialAuthorization(value);
    currentAuthorization = verifyAuthorizationLease(
      value,
      authorization,
      options,
    );
    await synchronizeModelAccess();
    return currentAuthorization;
  };

  handle(COMMERCIAL_CHANNELS.bootstrap, async (input) => {
    const device = await options.deviceIdentity.summary();
    const query = parseBootstrapQuery(input);
    const bootstrap = projectCommercialBootstrap(
      await requireClient().bootstrap({
        ...query,
        devicePublicKeyHash: device.publicKeyHash,
        currentVersion: query.currentVersion ?? options.clientVersion,
        target: query.target ?? options.platform,
        arch: query.arch ?? options.arch,
      }),
    );
    currentAuthorization = bootstrap.softwareAuthorization
      ? verifyAuthorizationLease(
          bootstrap,
          bootstrap.softwareAuthorization,
          options,
        )
      : null;
    cloudModelAssignments = defaultCloudTextModelAssignments(bootstrap.models);
    updateModelCapabilities(bootstrap.models);
    const access = await options.modelAccessStore.load();
    if (
      authorizationAllowsByok(currentAuthorization) &&
      access.mode === "byok"
    ) {
      try {
        bootstrap.models = await fetchByokModelCatalog(
          access,
          query.modelOperation,
        );
      } catch (error) {
        bootstrap.models = null;
        bootstrap.warnings.push(
          error instanceof Error ? error.message : "BYOK 模型目录读取失败",
        );
      }
    }
    await synchronizeModelAccess();
    return bootstrap;
  });
  handle(COMMERCIAL_CHANNELS.quotaBalance, async () =>
    projectCommercialQuota(await requireClient().quotaBalance()),
  );
  handle(COMMERCIAL_CHANNELS.modelCatalog, async (input) => {
    const query = parseModelCatalogQuery(input);
    const access = await options.modelAccessStore.load();
    if (
      authorizationAllowsByok(currentAuthorization) &&
      access.mode === "byok"
    ) {
      return fetchByokModelCatalog(access, query.operation);
    }
    const catalog = projectCommercialModelCatalog(
      await requireClient().modelCatalog(query),
    );
    updateModelCapabilities(catalog);
    if (
      query.operation?.trim().toUpperCase() === "TEXT" ||
      catalog.items.some((item) => item.operation.trim().toUpperCase() === "TEXT")
    ) {
      cloudModelAssignments = defaultCloudTextModelAssignments(catalog);
    }
    await synchronizeModelAccess();
    return catalog;
  });
  handle(COMMERCIAL_CHANNELS.currentLicense, async () =>
    publishAuthorization(await loadCurrentLicense()),
  );
  handle(COMMERCIAL_CHANNELS.activateLicense, async () => {
    const current = await loadCurrentLicense();
    await requireClient().activateLicense({
      licenseId: authorizationLicenseId(current),
      device: options.deviceIdentity,
      deviceName: options.deviceName,
      platform: options.platform,
      arch: options.arch,
      clientVersion: options.clientVersion,
    });
    return publishAuthorization(await loadCurrentLicense());
  });
  handle(COMMERCIAL_CHANNELS.refreshLicenseLease, async () => {
    const current = await loadCurrentLicense();
    await requireClient().refreshLicenseLease(authorizationActivationId(current));
    return publishAuthorization(await loadCurrentLicense());
  });
  handle(COMMERCIAL_CHANNELS.modelAccessStatus, async () => {
    const access = await options.modelAccessStore.load();
    const allowsCustomModels = authorizationAllowsByok(currentAuthorization);
    return rendererModelAccessStatus(
      options.modelAccessStore.status(access),
      allowsCustomModels,
      requireClient().baseUrl,
    );
  });
  handle(COMMERCIAL_CHANNELS.configureByok, async (input) => {
    if (!authorizationAllowsByok(currentAuthorization)) {
      throw new CommercialApiError("当前商业版本不允许使用 BYOK", {
        status: 403,
      });
    }
    const body = requiredRecord(input, "BYOK config");
    const apiKey = optionalText(body.apiKey);
    if (
      body.modelAssignments !== undefined &&
      !Array.isArray(body.modelAssignments)
    ) {
      throw new CommercialApiError("modelAssignments 必须是数组");
    }
    const access = await options.modelAccessStore.configureByok({
      baseUrl: requiredText(body.baseUrl, "baseUrl"),
      ...(apiKey ? { apiKey } : {}),
      ...(body.modelAssignments === undefined
        ? {}
        : {
            modelAssignments:
              body.modelAssignments as ByokModelAssignment[],
          }),
    });
    await synchronizeModelAccess();
    return rendererModelAccessStatus(
      options.modelAccessStore.status(access),
      true,
      requireClient().baseUrl,
    );
  });
  handle(COMMERCIAL_CHANNELS.selectCloudModels, async () => {
    const access = await options.modelAccessStore.selectCloud();
    await synchronizeModelAccess();
    return rendererModelAccessStatus(
      options.modelAccessStore.status(access),
      authorizationAllowsByok(currentAuthorization),
      requireClient().baseUrl,
    );
  });
  handle(COMMERCIAL_CHANNELS.clearByok, async () => {
    const access = await options.modelAccessStore.clearByok();
    await synchronizeModelAccess();
    return rendererModelAccessStatus(
      options.modelAccessStore.status(access),
      authorizationAllowsByok(currentAuthorization),
      requireClient().baseUrl,
    );
  });
  handle(COMMERCIAL_CHANNELS.announcements, (input) =>
    requireClient().announcements(input === undefined ? 20 : requiredInteger(input, "limit")),
  );
  handle(COMMERCIAL_CHANNELS.checkRelease, async () =>
    selectReleaseArtifactId(
      await requireClient().checkRelease({
        currentVersion: options.clientVersion,
        target: options.platform,
        arch: options.arch,
      }),
      options.platform,
      options.arch,
    ),
  );
  handle(COMMERCIAL_CHANNELS.downloadArtifact, async (input) => {
    const artifactId = requiredIdentifier(input, "artifactId");
    const metadata = await requireClient().releaseArtifactDownload(artifactId);
    if (!options.releaseArtifactDownloader) {
      throw new CommercialApiError("客户端尚未配置制品下载与校验器");
    }
    return options.releaseArtifactDownloader(metadata);
  });
  handle(COMMERCIAL_CHANNELS.installArtifact, async (input) => {
    const value = requiredRecord(input, "install artifact");
    const filePath = requiredText(value.filePath, "filePath");
    const sha256 = requiredText(value.sha256, "sha256");
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new CommercialApiError("安装程序 SHA-256 摘要无效");
    }
    if (!options.installArtifact) {
      throw new CommercialApiError("客户端尚未配置安装器");
    }
    await options.installArtifact({ filePath, sha256 });
  });

  return client;

  async function synchronizeModelAccess(): Promise<void> {
    const access = await options.modelAccessStore.load();
    await options.onModelAccessChanged(
      access,
      authorizationAllowsByok(currentAuthorization),
      cloudModelAssignments,
      [...modelCapabilities.values()],
    );
  }
}

const REFERENCE_DURATION_CAPABILITY_FIELDS = [
  "referenceAudioMinSeconds",
  "referenceAudioMaxSeconds",
  "referenceAudioTotalMinSeconds",
  "referenceAudioTotalMaxSeconds",
  "referenceVideoMinSeconds",
  "referenceVideoMaxSeconds",
  "referenceVideoTotalMinSeconds",
  "referenceVideoTotalMaxSeconds",
] as const;

function mergeModelCapabilities(
  catalog: ReturnType<typeof projectCommercialModelCatalog> | null,
  target: Map<string, CommercialModelCapabilitySnapshot>,
): void {
  for (const item of catalog?.items ?? []) {
    target.delete(item.code);
    if (!item.capabilityJson) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(item.capabilityJson);
    } catch {
      throw new CommercialApiError(
        `模型 ${item.code} 的 capabilityJson 不是有效 JSON`,
      );
    }
    const capabilities = optionalRecord(raw);
    const projected: CommercialModelCapabilitySnapshot = {
      modelId: item.code,
    };
    for (const field of REFERENCE_DURATION_CAPABILITY_FIELDS) {
      const value = capabilities[field];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        projected[field] = value;
      }
    }
    if (Object.keys(projected).length > 1) {
      target.set(item.code, projected);
    }
  }
}

function defaultCloudTextModelAssignments(
  catalog: ReturnType<typeof projectCommercialModelCatalog> | null,
): ByokModelAssignment[] {
  if (!catalog) return [];
  const textModels = catalog.items.filter(
    (item) => item.operation.trim().toUpperCase() === "TEXT",
  );
  const defaults = textModels.filter((item) => item.isDefault === true);
  const selected =
    defaults.length === 1
      ? defaults[0]
      : defaults.length === 0 && textModels.length === 1
        ? textModels[0]
        : null;
  return selected ? [{ modelId: selected.code, role: "TEXT" }] : [];
}

function authorizationAllowsByok(
  authorization: CommercialAuthorizationSnapshot | null,
): boolean {
  return authorization?.capabilities.allowsCustomModels === true;
}

function rendererModelAccessStatus(
  status: CommercialModelAccessStatus,
  allowsCustomModels: boolean,
  gatewayOrigin: string,
) {
  if (allowsCustomModels) {
    return { ...status, allowsCustomModels: true, gatewayOrigin };
  }
  return {
    ...status,
    mode: "cloud" as const,
    byokConfigured: false,
    byokBaseUrl: "",
    byokApiKeyPreview: "",
    byokModelAssignments: [],
    allowsCustomModels: false,
    gatewayOrigin,
  };
}

function verifyAuthorizationLease(
  raw: unknown,
  authorization: CommercialAuthorizationSnapshot,
  options: RegisterCommercialIpcOptions,
): CommercialAuthorizationSnapshot {
  if (!authorization.lease) return authorization;
  if (!options.leaseSigningKeys) return authorization;
  const root = optionalRecord(raw);
  const lease = optionalRecord(root.lease);
  const result = verifyOfflineLease(
    lease as Parameters<typeof verifyOfflineLease>[0],
    {
      publicKeys: options.leaseSigningKeys,
      ...(options.devicePublicKeyHash === undefined
        ? {}
        : { devicePublicKeyHash: options.devicePublicKeyHash }),
      ...(authorization.license?.id === undefined
        ? {}
        : { licenseId: authorization.license.id }),
    },
  );
  return result.verified
    ? {
        ...authorization,
        lease: { ...authorization.lease, verifiedOffline: true },
      }
    : authorization;
}

function parseLoginInput(value: unknown): CommercialLoginInput {
  const input = requiredRecord(value, "login");
  const rememberMe = input.rememberMe;
  if (rememberMe !== undefined && typeof rememberMe !== "boolean") {
    throw new CommercialApiError("rememberMe 必须是布尔值");
  }
  const captchaKey = optionalText(input.captchaKey);
  const captchaCode = optionalText(input.captchaCode);
  return {
    tenantCode: requiredText(input.tenantCode, "tenantCode"),
    username: requiredText(input.username, "username"),
    password: requiredText(input.password, "password"),
    ...(rememberMe === undefined ? {} : { rememberMe }),
    ...(captchaKey ? { captchaKey } : {}),
    ...(captchaCode ? { captchaCode } : {}),
  };
}

function parseBootstrapQuery(value: unknown): CommercialBootstrapQuery {
  const input = optionalRecord(value);
  const modelOperation = optionalText(input.modelOperation);
  const currentVersion = optionalText(input.currentVersion);
  const target = optionalText(input.target);
  const arch = optionalText(input.arch);
  return {
    ...(modelOperation ? { modelOperation } : {}),
    ...(currentVersion ? { currentVersion } : {}),
    ...(target ? { target } : {}),
    ...(arch ? { arch } : {}),
  };
}

function parseModelCatalogQuery(value: unknown): CommercialModelCatalogQuery {
  const input = optionalRecord(value);
  const operation = optionalText(input.operation);
  const catalogVersion = optionalText(input.catalogVersion);
  return {
    ...(operation ? { operation } : {}),
    ...(catalogVersion ? { catalogVersion } : {}),
  };
}
