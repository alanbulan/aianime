// Copyright (c) 2026 AI anime

const { contextBridge, ipcRenderer } = require("electron");

const WINDOW_CHANNELS = {
  minimize: "desktop:window:minimize",
  toggleMaximize: "desktop:window:toggle-maximize",
  close: "desktop:window:close",
  isMaximized: "desktop:window:is-maximized",
  maximizedChanged: "desktop:window:maximized-changed",
};
const COMMERCIAL_CHANNELS = {
  status: "desktop:commercial:status",
  publicConfig: "desktop:commercial:public-config",
  publicLogo: "desktop:commercial:public-logo",
  publicCaptcha: "desktop:commercial:public-captcha",
  register: "desktop:commercial:register",
  session: "desktop:commercial:session",
  login: "desktop:commercial:login",
  logout: "desktop:commercial:logout",
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
  installUpdate: "desktop:commercial:install-update",
  currentLicense: "desktop:commercial:current-license",
  activateLicense: "desktop:commercial:activate-license",
  refreshLicenseLease: "desktop:commercial:refresh-license-lease",
  deactivateLicense: "desktop:commercial:deactivate-license",
  modelAccessStatus: "desktop:commercial:model-access-status",
  configureByok: "desktop:commercial:configure-byok",
  selectCloudModels: "desktop:commercial:select-cloud-models",
  clearByok: "desktop:commercial:clear-byok",
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
  commercial: Object.freeze({
    status: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.status),
    publicConfig: (tenantCode) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.publicConfig, tenantCode),
    publicLogo: (tenantCode) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.publicLogo, tenantCode),
    publicCaptcha: (tenantCode) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.publicCaptcha, tenantCode),
    register: (input) => ipcRenderer.invoke(COMMERCIAL_CHANNELS.register, input),
    session: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.session),
    login: (input) => ipcRenderer.invoke(COMMERCIAL_CHANNELS.login, input),
    logout: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.logout),
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
    selectCloudModels: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.selectCloudModels),
    clearByok: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.clearByok),
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
    installUpdate: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.installUpdate),
  }),
});
