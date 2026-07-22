// Copyright (c) 2026 AI anime

const { contextBridge, ipcRenderer } = require("electron");

const WINDOW_CHANNELS = {
  minimize: "desktop:window:minimize",
  toggleMaximize: "desktop:window:toggle-maximize",
  close: "desktop:window:close",
  isMaximized: "desktop:window:is-maximized",
  maximizedChanged: "desktop:window:maximized-changed",
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
});
