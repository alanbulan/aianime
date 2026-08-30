// Copyright (c) 2026 AI anime

import { contextBridge, ipcRenderer } from "electron";

const WINDOW_CHANNELS = {
  minimize: "desktop:window:minimize",
  toggleMaximize: "desktop:window:toggle-maximize",
  close: "desktop:window:close",
  isMaximized: "desktop:window:is-maximized",
  maximizedChanged: "desktop:window:maximized-changed",
} as const;
const CLIPBOARD_CHANNELS = {
  writeText: "desktop:clipboard:write-text",
} as const;
const RUNTIME_DEPENDENCY_CHANNELS = {
  status: "desktop:runtime-dependencies:status",
  install: "desktop:runtime-dependencies:install",
  progress: "desktop:runtime-dependencies:progress",
} as const;
const COMMERCIAL_CHANNELS = {
  status: "desktop:commercial:status",
  publicConfig: "desktop:commercial:public-config",
  publicLogo: "desktop:commercial:public-logo",
  publicCaptcha: "desktop:commercial:public-captcha",
  register: "desktop:commercial:register",
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

contextBridge.exposeInMainWorld("aiAnimeDesktop", {
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }),
  windowControls: Object.freeze({
    minimize: () => ipcRenderer.send(WINDOW_CHANNELS.minimize),
    toggleMaximize: () => ipcRenderer.send(WINDOW_CHANNELS.toggleMaximize),
    close: () => ipcRenderer.send(WINDOW_CHANNELS.close),
    isMaximized: () => ipcRenderer.invoke(WINDOW_CHANNELS.isMaximized) as Promise<boolean>,
    onMaximizedChange: (listener: (maximized: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => listener(maximized);
      ipcRenderer.on(WINDOW_CHANNELS.maximizedChanged, handler);
      return () => ipcRenderer.removeListener(WINDOW_CHANNELS.maximizedChanged, handler);
    },
  }),
  clipboard: Object.freeze({
    writeText: (value: string) =>
      ipcRenderer.invoke(CLIPBOARD_CHANNELS.writeText, value) as Promise<void>,
  }),
  runtimeDependencies: Object.freeze({
    status: () => ipcRenderer.invoke(RUNTIME_DEPENDENCY_CHANNELS.status),
    install: () => ipcRenderer.invoke(RUNTIME_DEPENDENCY_CHANNELS.install),
    onProgress: (listener: (progress: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: unknown) =>
        listener(progress);
      ipcRenderer.on(RUNTIME_DEPENDENCY_CHANNELS.progress, handler);
      return () =>
        ipcRenderer.removeListener(RUNTIME_DEPENDENCY_CHANNELS.progress, handler);
    },
  }),
  commercial: Object.freeze({
    status: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.status),
    publicConfig: (tenantCode: string) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.publicConfig, tenantCode),
    publicLogo: (tenantCode: string) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.publicLogo, tenantCode),
    publicCaptcha: (tenantCode: string) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.publicCaptcha, tenantCode),
    register: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.register, input),
    session: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.session),
    rememberedLogin: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.rememberedLogin),
    revealRememberedPassword: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.revealRememberedPassword),
    login: (input: unknown) => ipcRenderer.invoke(COMMERCIAL_CHANNELS.login, input),
    loginRemembered: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.loginRemembered, input),
    logout: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.logout),
    profile: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.profile),
    updateProfile: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.updateProfile, input),
    avatar: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.avatar),
    uploadAvatar: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.uploadAvatar, input),
    deleteAvatar: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.deleteAvatar),
    changePassword: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.changePassword, input),
    sendPasswordResetCode: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.sendPasswordResetCode, input),
    verifyPasswordResetCode: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.verifyPasswordResetCode, input),
    resetPassword: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.resetPassword, input),
    bootstrap: (query: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.bootstrap, query),
    currentLicense: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.currentLicense),
    activateLicense: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.activateLicense),
    refreshLicenseLease: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.refreshLicenseLease),
    deactivateLicense: (reason: string) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.deactivateLicense, reason),
    modelAccessStatus: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.modelAccessStatus),
    configureByok: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.configureByok, input),
    selectCloudModels: (input?: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.selectCloudModels, input),
    clearByok: (input?: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.clearByok, input),
    byokProviderModels: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.byokProviderModels, input),
    quotaBalance: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.quotaBalance),
    modelCatalog: (query: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.modelCatalog, query),
    modelDetails: (sku: string) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.modelDetails, sku),
    invocationList: (query: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.invocationList, query),
    invocationDetails: (id: string | number) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.invocationDetails, id),
    cancelInvocation: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.cancelInvocation, input),
    saveInvocationResult: (id: string | number) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.saveInvocationResult, id),
    announcements: (limit = 20) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.announcements, limit),
    checkRelease: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.checkRelease),
    downloadUpdate: (artifactId: string | number) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.downloadUpdate, artifactId),
    onUpdateDownloadProgress: (listener: (progress: unknown) => void) => {
      const handler = (_event: unknown, progress: unknown) => listener(progress);
      ipcRenderer.on(COMMERCIAL_CHANNELS.updateDownloadProgress, handler);
      return () =>
        ipcRenderer.removeListener(
          COMMERCIAL_CHANNELS.updateDownloadProgress,
          handler,
        );
    },
    installUpdate: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.installUpdate),
  }),
});
