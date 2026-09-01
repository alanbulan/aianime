// Copyright (c) 2026 AI anime

import type { CommercialApiClient } from "./commercial-api-client.js";
import { registerCommercialAccountHandlers } from "./commercial-ipc-account-handlers.js";
import {
  CommercialIpcContext,
  type RegisterCommercialIpcOptions,
} from "./commercial-ipc-context.js";
import { registerCommercialModelHandlers } from "./commercial-ipc-model-handlers.js";
import { registerCommercialUpdateHandlers } from "./commercial-ipc-update-handlers.js";

export interface IpcInvokeEventLike {
  sender: { id: number; mainFrame?: unknown };
  senderFrame?: unknown;
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
  publicCaptcha: "desktop:commercial:public-captcha",
  session: "desktop:commercial:session",
  rememberedLogin: "desktop:commercial:remembered-login",
  revealRememberedPassword: "desktop:commercial:reveal-remembered-password",
  login: "desktop:commercial:login",
  loginRemembered: "desktop:commercial:login-remembered",
  logout: "desktop:commercial:logout",
  profile: "desktop:commercial:profile",
  updateProfile: "desktop:commercial:update-profile",
  avatar: "desktop:commercial:avatar",
  uploadAvatar: "desktop:commercial:upload-avatar",
  deleteAvatar: "desktop:commercial:delete-avatar",
  changePassword: "desktop:commercial:change-password",
  sendSmsLoginCode: "desktop:commercial:send-sms-login-code",
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

export const COMMERCIAL_IPC_ERROR_PREFIX = "AI_ANIME_COMMERCIAL_ERROR:";

export function registerCommercialIpc(
  options: RegisterCommercialIpcOptions,
): CommercialApiClient {
  const context = new CommercialIpcContext(
    options,
    COMMERCIAL_CHANNELS,
    COMMERCIAL_IPC_ERROR_PREFIX,
  );
  registerCommercialAccountHandlers(context);
  registerCommercialModelHandlers(context);
  registerCommercialUpdateHandlers(context);
  return options.client;
}
