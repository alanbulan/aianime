// Copyright (c) 2026 AI anime

import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import { LocalBackend } from "./backend.js";

let mainWindow: BrowserWindow | null = null;
let backend: LocalBackend | null = null;
let quitting = false;
const WINDOW_CHANNELS = {
  minimize: "desktop:window:minimize",
  toggleMaximize: "desktop:window:toggle-maximize",
  close: "desktop:window:close",
  isMaximized: "desktop:window:is-maximized",
  maximizedChanged: "desktop:window:maximized-changed",
} as const;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self';",
  "script-src 'self';",
  "style-src 'self' 'unsafe-inline';",
  "img-src 'self' data: blob:;",
  "media-src 'self' blob:;",
  "font-src 'self' data:;",
  "connect-src 'self';",
  "worker-src 'self' blob:;",
  "frame-ancestors 'none';",
  "base-uri 'self';",
  "form-action 'self';",
  "object-src 'none';",
].join(" ");

function isSameOrigin(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:";
  } catch {
    return false;
  }
}

function installBackendHeader(localBackend: LocalBackend): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`${localBackend.baseUrl}/*`] },
    (details, callback) => {
      details.requestHeaders[localBackend.tokenHeader] = localBackend.token;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: [`${localBackend.baseUrl}/*`] },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [CONTENT_SECURITY_POLICY],
          "X-Content-Type-Options": ["nosniff"],
        },
      });
    },
  );
}

async function createMainWindow(localBackend: LocalBackend): Promise<void> {
  const window = new BrowserWindow({
    title: "AI anime",
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#0b0d10",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  const emitMaximizedState = () => {
    if (!window.isDestroyed()) {
      window.webContents.send(WINDOW_CHANNELS.maximizedChanged, window.isMaximized());
    }
  };
  window.once("ready-to-show", () => window.show());
  window.on("maximize", emitMaximizedState);
  window.on("unmaximize", emitMaximizedState);
  window.on("closed", () => {
    mainWindow = null;
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isSameOrigin(url, localBackend.baseUrl)) event.preventDefault();
  });
  await window.loadURL(localBackend.baseUrl);
}

function registerWindowIpc(): void {
  const activeWindow = (senderId: number): BrowserWindow | null => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    return mainWindow.webContents.id === senderId ? mainWindow : null;
  };

  ipcMain.on(WINDOW_CHANNELS.minimize, (event) => {
    activeWindow(event.sender.id)?.minimize();
  });
  ipcMain.on(WINDOW_CHANNELS.toggleMaximize, (event) => {
    const window = activeWindow(event.sender.id);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.on(WINDOW_CHANNELS.close, (event) => {
    activeWindow(event.sender.id)?.close();
  });
  ipcMain.handle(WINDOW_CHANNELS.isMaximized, (event) => {
    return activeWindow(event.sender.id)?.isMaximized() ?? false;
  });
}

async function startApplication(): Promise<void> {
  backend = new LocalBackend();
  await backend.start();
  installBackendHeader(backend);
  await createMainWindow(backend);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  Menu.setApplicationMenu(null);
  registerWindowIpc();
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(startApplication).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    dialog.showErrorBox("AI anime failed to start", message);
    app.quit();
  });
}

app.on("before-quit", (event) => {
  if (!backend || quitting) return;
  event.preventDefault();
  quitting = true;
  void backend.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => app.quit());
