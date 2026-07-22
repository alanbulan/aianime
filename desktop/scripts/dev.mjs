// Copyright (c) 2026 AI anime

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import { LocalBackend } from "../src/backend.ts";

const WINDOW_CHANNELS = {
  minimize: "desktop:window:minimize",
  toggleMaximize: "desktop:window:toggle-maximize",
  close: "desktop:window:close",
  isMaximized: "desktop:window:is-maximized",
  maximizedChanged: "desktop:window:maximized-changed",
};
const VITE_URL = "http://127.0.0.1:5173";
const START_TIMEOUT_MS = 30_000;
const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const FRONTEND_ROOT = join(REPO_ROOT, "frontend");
const VITE_ENTRY = join(FRONTEND_ROOT, "node_modules", "vite", "bin", "vite.js");

let mainWindow = null;
let backend = null;
let viteProcess = null;
let quitting = false;

function sameOrigin(url, baseUrl) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function installBackendHeader(localBackend) {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`${localBackend.baseUrl}/*`] },
    (details, callback) => {
      details.requestHeaders[localBackend.tokenHeader] = localBackend.token;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
}

function registerWindowIpc() {
  const activeWindow = (senderId) => {
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

function startVite(localBackend) {
  if (!existsSync(VITE_ENTRY)) {
    throw new Error(`Vite entry not found: ${VITE_ENTRY}`);
  }
  const child = spawn(
    process.execPath,
    [VITE_ENTRY, "--host", "127.0.0.1", "--port", "5173", "--strictPort", "--mode", "ce"],
    {
      cwd: FRONTEND_ROOT,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        VITE_API_URL: localBackend.baseUrl,
        VITE_DESKTOP_TOKEN: localBackend.token,
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));
  return child;
}

async function waitForVite(child) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited during startup (${String(child.exitCode)})`);
    }
    try {
      const response = await fetch(VITE_URL, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      lastError = new Error(`Vite returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Vite startup timed out: ${String(lastError)}`);
}

async function createMainWindow() {
  const logoPath = join(FRONTEND_ROOT, "public", "images", "ai-anime-logo.png");
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
    ...(existsSync(logoPath) ? { icon: logoPath } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, "dev-preload.cjs"),
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
    if (!sameOrigin(url, VITE_URL)) event.preventDefault();
  });
  await window.loadURL(VITE_URL);
}

async function stopServices() {
  const child = viteProcess;
  viteProcess = null;
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([
      new Promise((done) => child.once("exit", done)),
      new Promise((done) => setTimeout(done, 2_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  const localBackend = backend;
  backend = null;
  await localBackend?.stop();
}

async function startApplication() {
  backend = new LocalBackend({ repositoryRoot: REPO_ROOT, serveFrontend: false });
  await backend.start();
  installBackendHeader(backend);
  viteProcess = startVite(backend);
  await waitForVite(viteProcess);
  await createMainWindow();
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
  app.whenReady().then(startApplication).catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    void stopServices().finally(() => {
      dialog.showErrorBox("AI anime failed to start", message);
      app.exit(1);
    });
  });
}

app.on("before-quit", (event) => {
  if (quitting || (!backend && !viteProcess)) return;
  event.preventDefault();
  quitting = true;
  void stopServices().finally(() => app.quit());
});

app.on("window-all-closed", () => app.quit());
