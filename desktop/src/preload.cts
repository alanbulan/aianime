// Copyright (c) 2026 AI anime

import { contextBridge, ipcRenderer } from "electron";

const WINDOW_CHANNELS = {
  minimize: "desktop:window:minimize",
  toggleMaximize: "desktop:window:toggle-maximize",
  close: "desktop:window:close",
  isMaximized: "desktop:window:is-maximized",
  maximizedChanged: "desktop:window:maximized-changed",
} as const;
const COMMERCIAL_CHANNELS = {
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
  currentLicense: "desktop:commercial:current-license",
  activateLicense: "desktop:commercial:activate-license",
  refreshLicenseLease: "desktop:commercial:refresh-license-lease",
  modelAccessStatus: "desktop:commercial:model-access-status",
  configureByok: "desktop:commercial:configure-byok",
  selectCloudModels: "desktop:commercial:select-cloud-models",
  clearByok: "desktop:commercial:clear-byok",
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
  commercial: Object.freeze({
    status: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.status),
    publicConfig: (tenantCode: string) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.publicConfig, tenantCode),
    publicLogo: (tenantCode: string) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.publicLogo, tenantCode),
    publicCaptcha: (tenantCode: string) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.publicCaptcha, tenantCode),
    session: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.session),
    login: (input: unknown) => ipcRenderer.invoke(COMMERCIAL_CHANNELS.login, input),
    logout: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.logout),
    bootstrap: (query: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.bootstrap, query),
    currentLicense: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.currentLicense),
    activateLicense: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.activateLicense),
    refreshLicenseLease: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.refreshLicenseLease),
    modelAccessStatus: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.modelAccessStatus),
    configureByok: (input: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.configureByok, input),
    selectCloudModels: () =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.selectCloudModels),
    clearByok: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.clearByok),
    quotaBalance: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.quotaBalance),
    modelCatalog: (query: unknown) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.modelCatalog, query),
    announcements: (limit = 20) =>
      ipcRenderer.invoke(COMMERCIAL_CHANNELS.announcements, limit),
    checkRelease: () => ipcRenderer.invoke(COMMERCIAL_CHANNELS.checkRelease),
  }),
});
