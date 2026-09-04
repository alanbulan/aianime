// Copyright (c) 2026 AI anime

const { contextBridge, ipcRenderer } = require("electron");

const WINDOW_CHANNELS = {
  minimize: "desktop:window:minimize",
  toggleMaximize: "desktop:window:toggle-maximize",
  close: "desktop:window:close",
  isMaximized: "desktop:window:is-maximized",
  maximizedChanged: "desktop:window:maximized-changed",
};
const CLIPBOARD_CHANNELS = {
  writeText: "desktop:clipboard:write-text",
};
const RUNTIME_DEPENDENCY_CHANNELS = {
  status: "desktop:runtime-dependencies:status",
  install: "desktop:runtime-dependencies:install",
  progress: "desktop:runtime-dependencies:progress",
};
const COMMERCIAL_CHANNELS = {
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
};

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
    isMaximized: () => ipcRenderer.invoke(WINDOW_CHANNELS.isMaximized),
    onMaximizedChange: (listener) => {
      const handler = (_event, maximized) => listener(maximized);
      ipcRenderer.on(WINDOW_CHANNELS.maximizedChanged, handler);
      return () => ipcRenderer.removeListener(WINDOW_CHANNELS.maximizedChanged, handler);
    },
  }),
  clipboard: Object.freeze({
    writeText: (value) => ipcRenderer.invoke(CLIPBOARD_CHANNELS.writeText, value),
  }),
  runtimeDependencies: Object.freeze({
    status: (id) => ipcRenderer.invoke(RUNTIME_DEPENDENCY_CHANNELS.status, id),
    install: (id) => ipcRenderer.invoke(RUNTIME_DEPENDENCY_CHANNELS.install, id),
    onProgress: (listener) => {
      const handler = (_event, progress) => listener(progress);
      ipcRenderer.on(RUNTIME_DEPENDENCY_CHANNELS.progress, handler);
      return () =>
        ipcRenderer.removeListener(RUNTIME_DEPENDENCY_CHANNELS.progress, handler);
    },
  }),
  commercial: Object.freeze({
    status: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.status),
    publicConfig: (tenantCode) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.publicConfig, tenantCode),
    publicCaptcha: (tenantCode) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.publicCaptcha, tenantCode),
    session: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.session),
    rememberedLogin: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.rememberedLogin),
    revealRememberedPassword: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.revealRememberedPassword),
    login: (input) => ipcRenderer.invoke(COMMERCIAL_CHANNELS.login, input),
    loginRemembered: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.loginRemembered, input),
    logout: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.logout),
    profile: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.profile),
    updateProfile: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.updateProfile, input),
    avatar: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.avatar),
    uploadAvatar: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.uploadAvatar, input),
    deleteAvatar: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.deleteAvatar),
    changePassword: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.changePassword, input),
    sendSmsLoginCode: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.sendSmsLoginCode, input),
    sendPasswordResetCode: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.sendPasswordResetCode, input),
    verifyPasswordResetCode: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.verifyPasswordResetCode, input),
    resetPassword: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.resetPassword, input),
    bootstrap: (query) => ipcRenderer.invoke(COMMERCIAL_CHANNELS.bootstrap, query),
    currentLicense: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.currentLicense),
    activateLicense: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.activateLicense),
    refreshLicenseLease: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.refreshLicenseLease),
    deactivateLicense: (reason) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.deactivateLicense, reason),
    modelAccessStatus: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.modelAccessStatus),
    configureByok: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.configureByok, input),
    selectCloudModels: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.selectCloudModels, input),
    clearByok: (input) => ipcRenderer.invoke(COMMERCIAL_CHANNELS.clearByok, input),
    byokProviderModels: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.byokProviderModels, input),
    quotaBalance: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.quotaBalance),
    modelCatalog: (query) => ipcRenderer.invoke(COMMERCIAL_CHANNELS.modelCatalog, query),
    modelDetails: (sku) => ipcRenderer.invoke(COMMERCIAL_CHANNELS.modelDetails, sku),
    invocationList: (query) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.invocationList, query),
    invocationDetails: (id) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.invocationDetails, id),
    cancelInvocation: (input) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.cancelInvocation, input),
    saveInvocationResult: (id) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.saveInvocationResult, id),
    announcements: (limit = 20) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.announcements, limit),
    checkRelease: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.checkRelease),
    downloadUpdate: (artifactId) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.downloadUpdate, artifactId),
    onUpdateDownloadProgress: (listener) => {
      const handler = (_event, progress) => listener(progress);
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
