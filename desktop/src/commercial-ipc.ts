// Copyright (c) 2026 AI anime

import { verifyOfflineLease } from "./commercial-lease.js";
import type { CommercialDeviceSigner } from "./commercial-device.js";
import {
  BYOK_MODEL_ROLES,
  fetchByokModelCatalog,
  fetchByokProviderModelIds,
  type ByokModelAssignment,
  type ByokModelRole,
  type ByokProviderProtocol,
  type CommercialModelAccessStatus,
  type EncryptedFileCommercialModelAccessStore,
  type StoredCommercialModelAccess,
} from "./commercial-model-access.js";
import {
  authorizationActivationId,
  authorizationDeviceId,
  authorizationLicenseId,
  projectCommercialAuthorization,
  projectCommercialBootstrap,
  projectCommercialInvocationDetails,
  projectCommercialInvocationList,
  projectCommercialModelCatalog,
  projectCommercialModelCatalogItem,
  projectCommercialQuota,
  selectReleaseArtifactId,
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
  requiredRawText,
  requiredRecord,
  requiredText,
  type CommercialBootstrapQuery,
  type CommercialInvocationQuery,
  type CommercialLoginInput,
  type CommercialRememberedLoginInput,
  type CommercialModelCatalogQuery,
  type CommercialProfileUpdateInput,
  type CommercialRegistrationInput,
  type CommercialSessionSummary,
} from "./commercial-api-client.js";

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
  register: "desktop:commercial:register",
  session: "desktop:commercial:session",
  rememberedLogin: "desktop:commercial:remembered-login",
  login: "desktop:commercial:login",
  loginRemembered: "desktop:commercial:login-remembered",
  logout: "desktop:commercial:logout",
  profile: "desktop:commercial:profile",
  updateProfile: "desktop:commercial:update-profile",
  avatar: "desktop:commercial:avatar",
  uploadAvatar: "desktop:commercial:upload-avatar",
  deleteAvatar: "desktop:commercial:delete-avatar",
  changePassword: "desktop:commercial:change-password",
  sendPasswordResetCode: "desktop:commercial:send-password-reset-code",
  verifyPasswordResetCode: "desktop:commercial:verify-password-reset-code",
  resetPassword: "desktop:commercial:reset-password",
  bootstrap: "desktop:commercial:bootstrap",
  quotaBalance: "desktop:commercial:quota-balance",
  modelCatalog: "desktop:commercial:model-catalog",
  modelDetails: "desktop:commercial:model-details",
  invocationList: "desktop:commercial:invocation-list",
  invocationDetails: "desktop:commercial:invocation-details",
  cancelInvocation: "desktop:commercial:cancel-invocation",
  saveInvocationResult: "desktop:commercial:save-invocation-result",
  announcements: "desktop:commercial:announcements",
  checkRelease: "desktop:commercial:check-release",
  downloadUpdate: "desktop:commercial:download-update",
  updateDownloadProgress: "desktop:commercial:update-download-progress",
  installUpdate: "desktop:commercial:install-update",
  currentLicense: "desktop:commercial:current-license",
  activateLicense: "desktop:commercial:activate-license",
  refreshLicenseLease: "desktop:commercial:refresh-license-lease",
  deactivateLicense: "desktop:commercial:deactivate-license",
  modelAccessStatus: "desktop:commercial:model-access-status",
  configureByok: "desktop:commercial:configure-byok",
  selectCloudModels: "desktop:commercial:select-cloud-models",
  clearByok: "desktop:commercial:clear-byok",
  byokProviderModels: "desktop:commercial:byok-provider-models",
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

export function registerCommercialIpc(
  options: RegisterCommercialIpcOptions,
): CommercialApiClient | null {
  const client = options.client;
  let currentAuthorization: CommercialAuthorizationSnapshot | null = null;
  let cloudModelAssignments: ByokModelAssignment[] = [];
  const modelCapabilities = new Map<string, CommercialModelCapabilitySnapshot>();
  let modelCapabilityCatalogVersion = "";
  let modelAccessHydrated = false;
  let modelAccessHydration: Promise<void> | null = null;
  let modelAccessSyncChain: Promise<void> = Promise.resolve();

  const clearAuthenticatedState = async (): Promise<void> => {
    await options.onLoggedOut();
    currentAuthorization = null;
    cloudModelAssignments = [];
    modelCapabilities.clear();
    modelCapabilityCatalogVersion = "";
    modelAccessHydrated = false;
    modelAccessHydration = null;
    await synchronizeModelAccess();
  };

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
  handle(COMMERCIAL_CHANNELS.register, (input) =>
    requireClient().register(parseRegistrationInput(input)),
  );
  handle(COMMERCIAL_CHANNELS.session, async () => {
    const session = await requireClient().restoreSession();
    if (session) {
      await options.onAuthenticated(session);
      await hydrateModelAccess();
    } else {
      currentAuthorization = null;
      cloudModelAssignments = [];
      modelCapabilities.clear();
      modelCapabilityCatalogVersion = "";
      modelAccessHydrated = false;
      modelAccessHydration = null;
      await synchronizeModelAccess();
      await options.onLoggedOut();
    }
    return session;
  });
  handle(COMMERCIAL_CHANNELS.rememberedLogin, () =>
    requireClient().rememberedLogin(),
  );
  handle(COMMERCIAL_CHANNELS.login, async (input) => {
    currentAuthorization = null;
    cloudModelAssignments = [];
    modelCapabilities.clear();
    modelCapabilityCatalogVersion = "";
    modelAccessHydrated = false;
    modelAccessHydration = null;
    await synchronizeModelAccess();
    const session = await requireClient().login(parseLoginInput(input));
    try {
      await options.onAuthenticated(session);
      await hydrateModelAccess();
    } catch (error) {
      await requireClient().logout();
      throw error;
    }
    return session;
  });
  handle(COMMERCIAL_CHANNELS.loginRemembered, async (input) => {
    currentAuthorization = null;
    cloudModelAssignments = [];
    modelCapabilities.clear();
    modelCapabilityCatalogVersion = "";
    modelAccessHydrated = false;
    modelAccessHydration = null;
    await synchronizeModelAccess();
    const session = await requireClient().loginRemembered(
      parseRememberedLoginInput(input),
    );
    try {
      await options.onAuthenticated(session);
      await hydrateModelAccess();
    } catch (error) {
      await requireClient().logout();
      throw error;
    }
    return session;
  });
  handle(COMMERCIAL_CHANNELS.logout, async () => {
    const result = client ? await client.logout() : { remoteRevoked: false };
    await clearAuthenticatedState();
    return result;
  });
  handle(COMMERCIAL_CHANNELS.profile, () => requireClient().currentProfile());
  handle(COMMERCIAL_CHANNELS.updateProfile, (input) =>
    requireClient().updateProfile(parseProfileUpdateInput(input)),
  );
  handle(COMMERCIAL_CHANNELS.avatar, () => requireClient().currentAvatar());
  handle(COMMERCIAL_CHANNELS.uploadAvatar, async (input) => {
    const upload = requiredRecord(input, "avatar upload");
    const contentType = requiredText(upload.contentType, "contentType").toLowerCase();
    const bytes = requiredBytes(upload.bytes, "bytes");
    await requireClient().uploadAvatar({
      fileName: requiredText(upload.fileName, "fileName"),
      contentType,
      bytes,
    });
    return {
      profile: await requireClient().currentProfile(),
      avatar: {
        contentType,
        dataUrl: `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`,
      },
    };
  });
  handle(COMMERCIAL_CHANNELS.deleteAvatar, async () => {
    await requireClient().deleteAvatar();
    return { profile: await requireClient().currentProfile() };
  });
  handle(COMMERCIAL_CHANNELS.changePassword, async (input) => {
    const body = requiredRecord(input, "change password");
    await requireClient().changePassword(
      requiredRawText(body.oldPassword, "oldPassword"),
      requiredRawText(body.newPassword, "newPassword"),
    );
    await clearAuthenticatedState();
  });
  handle(COMMERCIAL_CHANNELS.sendPasswordResetCode, async (input) => {
    const body = requiredRecord(input, "send password reset code");
    await requireClient().sendPasswordResetCode(
      requiredText(body.tenantCode, "tenantCode"),
      requiredText(body.email, "email"),
    );
  });
  handle(COMMERCIAL_CHANNELS.verifyPasswordResetCode, (input) => {
    const body = requiredRecord(input, "verify password reset code");
    return requireClient().verifyPasswordResetCode(
      requiredText(body.tenantCode, "tenantCode"),
      requiredText(body.email, "email"),
      requiredText(body.code, "code"),
    );
  });
  handle(COMMERCIAL_CHANNELS.resetPassword, async (input) => {
    const body = requiredRecord(input, "reset password");
    await requireClient().resetPassword(
      requiredText(body.tenantCode, "tenantCode"),
      requiredText(body.resetTicket, "resetTicket"),
      requiredRawText(body.newPassword, "newPassword"),
    );
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
  const ensureCurrentAuthorization = async (): Promise<CommercialAuthorizationSnapshot> =>
    currentAuthorization ??
    publishAuthorization(await loadCurrentLicense());

  handle(COMMERCIAL_CHANNELS.bootstrap, async (input) => {
    const device = await options.deviceIdentity.summary();
    const query = parseBootstrapQuery(input);
    const rawBootstrap = await requireClient().bootstrap({
      ...query,
      devicePublicKeyHash: device.publicKeyHash,
      currentVersion: query.currentVersion ?? options.clientVersion,
      target: query.target ?? options.platform,
      arch: query.arch ?? options.arch,
    }, currentAuthorization?.device
      ? authorizationDeviceId(currentAuthorization)
      : undefined);
    const bootstrap = projectCommercialBootstrap(rawBootstrap);
    const rawAuthorization = optionalRecord(rawBootstrap).softwareAuthorization;
    currentAuthorization = bootstrap.softwareAuthorization
      ? verifyAuthorizationLease(
          rawAuthorization,
          bootstrap.softwareAuthorization,
          options,
        )
      : null;
    bootstrap.softwareAuthorization = currentAuthorization;
    const access = await options.modelAccessStore.load();
    cloudModelAssignments = updateCloudModelAssignments(
      (access.cloudModelAssignments ?? []).length > 0
        ? access.cloudModelAssignments ?? []
        : cloudModelAssignments,
      bootstrap.models,
      query.modelOperation ?? "TEXT",
    );
    updateModelCapabilities(bootstrap.models);
    if (authorizationAllowsByok(currentAuthorization)) {
      bootstrap.models = mergeModelCatalogs(
        bootstrap.models,
        await fetchByokModelCatalog(access, query.modelOperation),
      );
    }
    await synchronizeModelAccess();
    return bootstrap;
  });
  handle(COMMERCIAL_CHANNELS.quotaBalance, async () =>
    projectCommercialQuota(await requireClient().quotaBalance()),
  );
  handle(COMMERCIAL_CHANNELS.modelCatalog, async (input) => {
    const { source, query } = parseModelCatalogQuery(input);
    const authorization = await ensureCurrentAuthorization();
    const access = await options.modelAccessStore.load();
    const cloudCatalog = projectCommercialModelCatalog(
      await requireClient().modelCatalog(
        query,
        authorizationDeviceId(authorization),
      ),
    );
    updateModelCapabilities(cloudCatalog);
    cloudModelAssignments = updateCloudModelAssignments(
      cloudModelAssignments,
      cloudCatalog,
      query.operation,
    );
    await synchronizeModelAccess();
    if (source === "cloud" || !authorizationAllowsByok(authorization)) {
      return cloudCatalog;
    }
    return mergeModelCatalogs(
      cloudCatalog,
      await fetchByokModelCatalog(access, query.operation),
    );
  });
  handle(COMMERCIAL_CHANNELS.modelDetails, async (input) => {
    const authorization = await ensureCurrentAuthorization();
    return projectCommercialModelCatalogItem(
      await requireClient().modelDetails(
        requiredText(input, "sku"),
        authorizationDeviceId(authorization),
      ),
    );
  });
  handle(COMMERCIAL_CHANNELS.invocationList, async (input) =>
    projectCommercialInvocationList(
      await requireClient().listInvocations(parseInvocationQuery(input)),
    ),
  );
  handle(COMMERCIAL_CHANNELS.invocationDetails, async (input) =>
    projectCommercialInvocationDetails(
      await requireClient().invocationDetails(requiredIdentifier(input, "id")),
    ),
  );
  handle(COMMERCIAL_CHANNELS.cancelInvocation, async (input) => {
    const body = requiredRecord(input, "cancel invocation");
    const id = requiredIdentifier(body.id, "id");
    await requireClient().cancelInvocation(
      id,
      requiredText(body.reason, "reason"),
    );
    return projectCommercialInvocationDetails(
      await requireClient().invocationDetails(id),
    );
  });
  handle(COMMERCIAL_CHANNELS.saveInvocationResult, async (input) => {
    if (!options.saveInvocationResult) {
      throw new CommercialApiError("客户端尚未配置调用结果保存器");
    }
    return options.saveInvocationResult(requiredIdentifier(input, "id"));
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
  handle(COMMERCIAL_CHANNELS.deactivateLicense, async (input) => {
    const current = await loadCurrentLicense();
    await requireClient().deactivateLicense(
      authorizationActivationId(current),
      requiredText(input, "reason"),
    );
    return publishAuthorization(await loadCurrentLicense());
  });
  handle(COMMERCIAL_CHANNELS.modelAccessStatus, async () => {
    const authorization = await ensureCurrentAuthorization();
    const access = await options.modelAccessStore.load();
    const allowsCustomModels = authorizationAllowsByok(authorization);
    return rendererModelAccessStatus(
      options.modelAccessStore.status(access),
      allowsCustomModels,
      requireClient().baseUrl,
      cloudModelAssignments,
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
      ...(optionalText(body.providerId)
        ? { providerId: optionalText(body.providerId)! }
        : {}),
      ...(optionalText(body.name) ? { name: optionalText(body.name)! } : {}),
      ...(optionalText(body.protocol)
        ? { protocol: optionalText(body.protocol)! as ByokProviderProtocol }
        : {}),
      baseUrl: requiredText(body.baseUrl, "baseUrl"),
      ...(apiKey ? { apiKey } : {}),
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(body.priority === undefined
        ? {}
        : { priority: requiredInteger(body.priority, "priority") }),
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
      cloudModelAssignments,
    );
  });
  handle(COMMERCIAL_CHANNELS.selectCloudModels, async (input) => {
    const body = optionalRecord(input);
    if (
      body.modelAssignments !== undefined &&
      !Array.isArray(body.modelAssignments)
    ) {
      throw new CommercialApiError("modelAssignments 必须是数组");
    }
    const requestedAssignments = body.modelAssignments as
      | ByokModelAssignment[]
      | undefined;
    const access = await options.modelAccessStore.selectCloud(
      requestedAssignments,
    );
    if (requestedAssignments !== undefined || cloudModelAssignments.length === 0) {
      cloudModelAssignments = [...(access.cloudModelAssignments ?? [])];
    }
    await synchronizeModelAccess();
    return rendererModelAccessStatus(
      options.modelAccessStore.status(access),
      authorizationAllowsByok(currentAuthorization),
      requireClient().baseUrl,
      cloudModelAssignments,
    );
  });
  handle(COMMERCIAL_CHANNELS.clearByok, async (input) => {
    const access = await options.modelAccessStore.clearByok(
      optionalText(optionalRecord(input).providerId),
    );
    await synchronizeModelAccess();
    return rendererModelAccessStatus(
      options.modelAccessStore.status(access),
      authorizationAllowsByok(currentAuthorization),
      requireClient().baseUrl,
      cloudModelAssignments,
    );
  });
  handle(COMMERCIAL_CHANNELS.byokProviderModels, async (input) => {
    if (!authorizationAllowsByok(currentAuthorization)) {
      throw new CommercialApiError("当前商业版本不允许使用 BYOK", {
        status: 403,
      });
    }
    const body = requiredRecord(input, "BYOK model discovery");
    const providerId = optionalText(body.providerId);
    const name = optionalText(body.name);
    const protocol = optionalText(body.protocol);
    const apiKey = optionalText(body.apiKey);
    const access = await options.modelAccessStore.load();
    return fetchByokProviderModelIds(
      access,
      {
        ...(providerId ? { providerId } : {}),
        ...(name ? { name } : {}),
        ...(protocol ? { protocol: protocol as ByokProviderProtocol } : {}),
        baseUrl: requiredText(body.baseUrl, "baseUrl"),
        ...(apiKey ? { apiKey } : {}),
      },
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
  handle(COMMERCIAL_CHANNELS.downloadUpdate, async (input) => {
    const artifactId = requiredIdentifier(input, "artifactId");
    if (!options.releaseUpdater) {
      throw new CommercialApiError("客户端尚未配置更新器");
    }
    return options.releaseUpdater.download(artifactId);
  });
  handle(COMMERCIAL_CHANNELS.installUpdate, () => {
    if (!options.releaseUpdater) {
      throw new CommercialApiError("客户端尚未配置更新器");
    }
    options.releaseUpdater.install();
  });

  return client;

  /**
   * Push the stored model access to the proxy and the sidecar, one at a time.
   *
   * `onModelAccessChanged` replaces the proxy routing table synchronously and
   * then POSTs the capability config to the sidecar. Over a dozen handlers call
   * this, so two concurrent callers could interleave those two steps and leave
   * the routing table describing a different configuration than the sidecar
   * received. Serializing also means each run loads the store *after* the
   * previous run finished, so the last caller always applies the newest state.
   */
  function synchronizeModelAccess(): Promise<void> {
    const run = modelAccessSyncChain.then(
      applyModelAccess,
      // A failed predecessor must not stall every later synchronization.
      applyModelAccess,
    );
    modelAccessSyncChain = run.catch(() => undefined);
    return run;
  }

  async function applyModelAccess(): Promise<void> {
    const access = await options.modelAccessStore.load();
    await options.onModelAccessChanged(
      access,
      authorizationAllowsByok(currentAuthorization),
      cloudModelAssignments,
      [...modelCapabilities.values()],
    );
  }

  async function hydrateModelAccess(): Promise<void> {
    if (modelAccessHydrated) return;
    if (modelAccessHydration) return modelAccessHydration;
    modelAccessHydration = (async () => {
      try {
        const authorization = await ensureCurrentAuthorization();
        const access = await options.modelAccessStore.load();
        cloudModelAssignments = [...(access.cloudModelAssignments ?? [])];
        const catalog = projectCommercialModelCatalog(
          await requireClient().modelCatalog(
            {},
            authorizationDeviceId(authorization),
          ),
        );
        updateModelCapabilities(catalog);
        cloudModelAssignments = updateCloudModelAssignments(
          cloudModelAssignments,
          catalog,
        );
        await synchronizeModelAccess();
        modelAccessHydrated = true;
      } catch (error) {
        await synchronizeModelAccess();
        console.warn(
          "[commercial] model access initialization failed:",
          error instanceof Error ? error.message : String(error),
        );
      }
    })();
    try {
      await modelAccessHydration;
    } finally {
      modelAccessHydration = null;
    }
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

const CLOUD_ROLES_BY_OPERATION: Readonly<
  Record<string, readonly ByokModelRole[]>
> = {
  TEXT: ["TEXT"],
  IMAGE: ["IMAGE_GENERATION", "IMAGE_EDIT"],
  VIDEO: [
    "VIDEO_TEXT_TO_VIDEO",
    "VIDEO_IMAGE_TO_VIDEO",
    "VIDEO_FIRST_LAST_FRAME",
    "VIDEO_IMAGE_REFERENCE",
    "VIDEO_ALL_REFERENCE",
    "VIDEO_EDIT",
  ],
  AUDIO: ["AUDIO_SPEECH", "AUDIO_VOICE_CLONE", "AUDIO_MUSIC"],
  EMBEDDING: ["EMBEDDING"],
};

const CLOUD_ROLE_MODES: Readonly<
  Partial<Record<ByokModelRole, readonly string[]>>
> = {
  IMAGE_GENERATION: ["TEXT_TO_IMAGE", "IMAGE_GENERATION"],
  IMAGE_EDIT: ["IMAGE_EDIT", "EDIT"],
  VIDEO_TEXT_TO_VIDEO: ["TEXT_TO_VIDEO"],
  VIDEO_IMAGE_TO_VIDEO: ["FIRST_FRAME", "IMAGE_TO_VIDEO"],
  VIDEO_FIRST_LAST_FRAME: ["FIRST_LAST_FRAME"],
  VIDEO_IMAGE_REFERENCE: ["IMAGE_REFERENCE", "REFERENCE_IMAGE"],
  VIDEO_ALL_REFERENCE: ["ALL_REFERENCE"],
  VIDEO_EDIT: ["VIDEO_EDIT", "EDIT"],
  AUDIO_SPEECH: ["SPEECH", "TEXT_TO_SPEECH", "SPEECH_SYNTHESIS"],
  AUDIO_VOICE_CLONE: ["VOICE_CLONE"],
  AUDIO_MUSIC: ["MUSIC", "TEXT_TO_MUSIC", "MUSIC_GENERATION"],
};

function updateCloudModelAssignments(
  current: readonly ByokModelAssignment[],
  catalog: ReturnType<typeof projectCommercialModelCatalog> | null,
  requestedOperation?: string,
): ByokModelAssignment[] {
  const operations = new Set(
    (catalog?.items ?? []).map((item) => item.operation.trim().toUpperCase()),
  );
  const normalizedRequestedOperation = requestedOperation?.trim().toUpperCase();
  if (normalizedRequestedOperation) operations.add(normalizedRequestedOperation);
  if (operations.size === 0) return [...current];

  const replacedRoles = new Set<ByokModelRole>();
  for (const operation of operations) {
    for (const role of CLOUD_ROLES_BY_OPERATION[operation] ?? []) {
      replacedRoles.add(role);
    }
  }
  const next = current.filter((item) => !replacedRoles.has(item.role));
  if (!catalog) return next;

  for (const role of replacedRoles) {
    const candidates = catalog.items.filter((item) =>
      catalogItemSupportsRole(item, role),
    );
    const currentSelection = current.find(
      (item) =>
        item.role === role &&
        candidates.some((candidate) => candidate.code === item.modelId),
    );
    const defaults = candidates.filter((item) => item.isDefault === true);
    const selected =
      currentSelection
        ? candidates.find((item) => item.code === currentSelection.modelId) ?? null
        : defaults.length === 1
        ? defaults[0]
        : defaults.length === 0 && candidates.length === 1
          ? candidates[0]
          : null;
    if (selected) {
      next.push({
        modelId: selected.code,
        role,
        priority: currentSelection?.priority ?? 100,
        enabled: currentSelection?.enabled ?? true,
      });
    }
  }
  return next.sort(
    (left, right) =>
      BYOK_MODEL_ROLES.indexOf(left.role) - BYOK_MODEL_ROLES.indexOf(right.role),
  );
}

function mergeModelCatalogs(
  cloud: ReturnType<typeof projectCommercialModelCatalog> | null,
  byok: Awaited<ReturnType<typeof fetchByokModelCatalog>>,
): ReturnType<typeof projectCommercialModelCatalog> {
  if (!cloud) return byok;
  const items = [...cloud.items];
  const seen = new Set(items.map((item) => String(item.id)));
  for (const item of byok.items) {
    if (!seen.has(String(item.id))) items.push(item);
  }
  return {
    catalogVersion: `${cloud.catalogVersion}+${byok.catalogVersion}`,
    items,
  };
}

function catalogItemSupportsRole(
  item: ReturnType<typeof projectCommercialModelCatalog>["items"][number],
  role: ByokModelRole,
): boolean {
  const operation = item.operation.trim().toUpperCase();
  if (!(CLOUD_ROLES_BY_OPERATION[operation] ?? []).includes(role)) return false;
  const roleModes = CLOUD_ROLE_MODES[role];
  if (!roleModes) return true;

  const modes = catalogItemModes(item.capabilityJson);
  if (modes.length > 0) {
    return roleModes.some((mode) => modes.includes(mode));
  }
  return role === "IMAGE_GENERATION" || role === "VIDEO_TEXT_TO_VIDEO";
}

function catalogItemModes(capabilityJson: string | undefined): string[] {
  if (!capabilityJson) return [];
  let value: unknown;
  try {
    value = JSON.parse(capabilityJson);
  } catch {
    return [];
  }
  const capabilities = optionalRecord(value);
  const rawModes =
    capabilities.supportedModes ?? capabilities.modes ?? capabilities.audioModes;
  if (!Array.isArray(rawModes)) return [];
  return rawModes
    .filter((mode): mode is string => typeof mode === "string")
    .map((mode) =>
      mode
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toUpperCase()
        .replaceAll(/[^A-Z0-9]+/g, "_"),
    )
    .filter(Boolean);
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
  cloudModelAssignments: readonly ByokModelAssignment[],
) {
  if (allowsCustomModels) {
    return {
      ...status,
      cloudModelAssignments: [...cloudModelAssignments],
      allowsCustomModels: true,
      gatewayOrigin,
    };
  }
  return {
    ...status,
    mode: "mixed" as const,
    cloudModelAssignments: [...cloudModelAssignments],
    byokConfigured: false,
    byokProviders: [],
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
    password: requiredRawText(input.password, "password"),
    ...(rememberMe === undefined ? {} : { rememberMe }),
    ...(captchaKey ? { captchaKey } : {}),
    ...(captchaCode ? { captchaCode } : {}),
  };
}

function parseRememberedLoginInput(
  value: unknown,
): CommercialRememberedLoginInput {
  const input = requiredRecord(value, "remembered login");
  const rememberMe = input.rememberMe;
  if (rememberMe !== undefined && typeof rememberMe !== "boolean") {
    throw new CommercialApiError("rememberMe 必须是布尔值");
  }
  const captchaKey = optionalText(input.captchaKey);
  const captchaCode = optionalText(input.captchaCode);
  return {
    ...(rememberMe === undefined ? {} : { rememberMe }),
    ...(captchaKey ? { captchaKey } : {}),
    ...(captchaCode ? { captchaCode } : {}),
  };
}

function parseRegistrationInput(value: unknown): CommercialRegistrationInput {
  const input = requiredRecord(value, "registration");
  const nickname = optionalText(input.nickname);
  const email = optionalText(input.email);
  const captchaKey = optionalText(input.captchaKey);
  const captchaCode = optionalText(input.captchaCode);
  return {
    tenantCode: requiredText(input.tenantCode, "tenantCode"),
    username: requiredText(input.username, "username"),
    password: requiredRawText(input.password, "password"),
    ...(nickname ? { nickname } : {}),
    ...(email ? { email } : {}),
    ...(captchaKey ? { captchaKey } : {}),
    ...(captchaCode ? { captchaCode } : {}),
  };
}

function parseProfileUpdateInput(value: unknown): CommercialProfileUpdateInput {
  const input = requiredRecord(value, "profile update");
  const gender = requiredInteger(input.gender, "gender");
  if (gender !== 0 && gender !== 1 && gender !== 2) {
    throw new CommercialApiError("gender 只能为 0、1 或 2");
  }
  return {
    nickname: textField(input.nickname, "nickname"),
    email: textField(input.email, "email"),
    phone: textField(input.phone, "phone"),
    gender,
    profileDescription: textField(
      input.profileDescription,
      "profileDescription",
    ),
  };
}

function textField(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new CommercialApiError(`${name} 必须是字符串`);
  }
  return value;
}

function requiredBytes(value: unknown, name: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new CommercialApiError(`${name} 必须是字节数组`);
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

function parseModelCatalogQuery(value: unknown): {
  source: "active" | "cloud";
  query: CommercialModelCatalogQuery;
} {
  const input = optionalRecord(value);
  const operation = optionalText(input.operation);
  const catalogVersion = optionalText(input.catalogVersion);
  const requestedSource = optionalText(input.source)?.toLowerCase() ?? "";
  if (requestedSource && requestedSource !== "active" && requestedSource !== "cloud") {
    throw new CommercialApiError("模型目录来源无效");
  }
  return {
    source: requestedSource === "cloud" ? "cloud" : "active",
    query: {
      ...(operation ? { operation } : {}),
      ...(catalogVersion ? { catalogVersion } : {}),
    },
  };
}

function parseInvocationQuery(value: unknown): CommercialInvocationQuery {
  const input = optionalRecord(value);
  const page = input.page === undefined ? undefined : requiredInteger(input.page, "page");
  const pageSize =
    input.pageSize === undefined
      ? undefined
      : requiredInteger(input.pageSize, "pageSize");
  if (page !== undefined && page < 1) {
    throw new CommercialApiError("page 必须大于等于 1");
  }
  if (pageSize !== undefined && (pageSize < 1 || pageSize > 100)) {
    throw new CommercialApiError("pageSize 必须是 1 到 100 之间的整数");
  }
  const status = optionalText(input.status);
  const operation = optionalText(input.operation);
  const modelSkuCode = optionalText(input.modelSkuCode);
  return {
    ...(page === undefined ? {} : { page }),
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(status ? { status } : {}),
    ...(operation ? { operation } : {}),
    ...(modelSkuCode ? { modelSkuCode } : {}),
  };
}
