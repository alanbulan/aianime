// Copyright (c) 2026 AI anime

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { hostname } from "node:os";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  session,
  shell,
} from "electron";
import { LocalBackend } from "../src/backend.ts";
import { EncryptedFileCommercialDeviceIdentity } from "../src/commercial-device.ts";
import {
  CommercialModelProxy,
  modelRoutingSnapshot,
} from "../src/commercial-model-proxy.ts";
import { EncryptedFileCommercialModelAccessStore } from "../src/commercial-model-access.ts";
import { saveCommercialInvocationResult } from "../src/commercial-invocation-result.ts";
import {
  CommercialApiClient,
  COMMERCIAL_RUNTIME_DEPENDENCIES_URL,
  EncryptedFileCommercialSessionStore,
  registerCommercialIpc,
  resolveCommercialGatewayUrl,
} from "../src/commercial.ts";
import { developmentHermesCliPath } from "../src/hermes-runtime.ts";
import {
  registerRuntimeDependencyIpc,
  RuntimeDependencyManager,
} from "../src/runtime-dependencies.ts";
import {
  AUTH_COOKIE_NAME,
  commercialArchitecture,
  commercialPlatform,
  desktopSessionCookie,
  isAllowedExternalUrl,
  isSameOrigin,
} from "../src/desktop-runtime-contracts.ts";

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
const VITE_PORT = process.env.AI_ANIME_DEV_VITE_PORT?.trim() || "5173";
const VITE_URL = `http://127.0.0.1:${VITE_PORT}`;
const START_TIMEOUT_MS = 30_000;
const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const FRONTEND_ROOT = join(REPO_ROOT, "frontend");
const VITE_ENTRY = join(FRONTEND_ROOT, "node_modules", "vite", "bin", "vite.js");
const HERMES_RUNTIME_ROOT = join(REPO_ROOT, "desktop", "hermes-runtime");
let mainWindow = null;
let backend = null;
let commercialModelProxy = null;
let viteProcess = null;
let quitting = false;

const configuredUserData = process.env.AI_ANIME_DEV_USER_DATA_DIR?.trim();
const developmentUserData = configuredUserData
  ? resolve(configuredUserData)
  : join(app.getPath("appData"), "@ai-anime", "desktop");
app.setPath("userData", developmentUserData);

async function prepareHermesRuntime() {
  const uvCommand = process.env.AI_ANIME_UV_COMMAND?.trim() || "uv";
  const child = spawn(
    uvCommand,
    ["sync", "--project", HERMES_RUNTIME_ROOT, "--locked", "--no-dev"],
    {
      cwd: REPO_ROOT,
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => process.stdout.write(`[hermes] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[hermes] ${chunk}`));
  await new Promise((resolveRuntime, rejectRuntime) => {
    child.once("error", rejectRuntime);
    child.once("exit", (code) => {
      if (code === 0) resolveRuntime();
      else rejectRuntime(new Error(`Hermes runtime sync exited with ${String(code)}`));
    });
  });
  const cliPath = developmentHermesCliPath(REPO_ROOT);
  if (!existsSync(cliPath)) {
    throw new Error(`Hermes runtime sync completed but CLI is missing: ${cliPath}`);
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
  ipcMain.handle(CLIPBOARD_CHANNELS.writeText, (event, value) => {
    if (!activeWindow(event.sender.id)) {
      throw new Error("clipboard sender is not the active desktop window");
    }
    if (typeof value !== "string") {
      throw new TypeError("clipboard value must be a string");
    }
    clipboard.writeText(value);
  });
}

async function setDesktopSessionCookies(cloudSession, origins) {
  await Promise.all(
    origins.map((origin) =>
      session.defaultSession.cookies.set(
        desktopSessionCookie(origin, cloudSession.user.username),
      ),
    ),
  );
}

function registerCommercialGatewayIpc(
  localBackend,
  client,
  deviceIdentity,
  modelAccessStore,
) {
  const origins = [VITE_URL, localBackend.baseUrl];
  registerCommercialIpc({
    ipcMain,
    client,
    deviceIdentity,
    modelAccessStore,
    deviceName: hostname(),
    platform: commercialPlatform(),
    arch: commercialArchitecture(),
    clientVersion: app.getVersion(),
    isAllowedSender: (senderId) =>
      Boolean(
        mainWindow &&
          !mainWindow.isDestroyed() &&
          mainWindow.webContents.id === senderId,
      ),
    onAuthenticated: (cloudSession) =>
      setDesktopSessionCookies(cloudSession, origins),
    onModelAccessChanged: (
      access,
      allowsCustomModels,
      cloudModelAssignments,
      modelCapabilities,
    ) => {
      const routing = {
        access,
        allowsCustomModels,
        cloudModelAssignments,
      };
      commercialModelProxy?.configureRouting(routing);
      return localBackend.configureModelAccess({
        allowsCustomModels,
        mode: "mixed",
        modelAssignments: modelRoutingSnapshot(routing),
        modelCapabilities: [...modelCapabilities],
      });
    },
    onLoggedOut: () =>
      Promise.all(
        origins.map((origin) =>
          session.defaultSession.cookies.remove(origin, AUTH_COOKIE_NAME),
        ),
      ),
    saveInvocationResult: (id) =>
      saveCommercialInvocationResult(client, id, async (suggestedName) => {
        const result = mainWindow
          ? await dialog.showSaveDialog(mainWindow, { defaultPath: suggestedName })
          : await dialog.showSaveDialog({ defaultPath: suggestedName });
        return result.canceled ? null : result.filePath ?? null;
      }),
  });
}

function startVite(localBackend) {
  if (!existsSync(VITE_ENTRY)) {
    throw new Error(`Vite entry not found: ${VITE_ENTRY}`);
  }
  const child = spawn(
    process.execPath,
    [VITE_ENTRY, "--host", "127.0.0.1", "--port", VITE_PORT, "--strictPort", "--mode", "ce"],
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
  window.webContents.on("console-message", (_event, ...args) => {
    const details = args[0];
    if (details && typeof details === "object") {
      const level = details.level ?? "unknown";
      const source = details.sourceId ? ` ${details.sourceId}:${details.lineNumber ?? 0}` : "";
      process.stderr.write(`[renderer:${level}]${source} ${String(details.message ?? "")}\n`);
      return;
    }
    const [level, message, line, sourceId] = args;
    process.stderr.write(
      `[renderer:${String(level)}] ${String(sourceId ?? "")}:${String(line ?? 0)} ${String(message ?? "")}\n`,
    );
  });
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    process.stderr.write(`[preload-error] ${preloadPath}: ${error.stack || error.message}\n`);
  });
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      process.stderr.write(
        `[did-fail-load] ${errorCode} ${errorDescription} ${validatedURL}\n`,
      );
    },
  );
  window.webContents.on("render-process-gone", (_event, details) => {
    process.stderr.write(
      `[render-process-gone] ${details.reason} exitCode=${details.exitCode}\n`,
    );
  });
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
    if (!isSameOrigin(url, VITE_URL)) event.preventDefault();
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
  const modelProxy = commercialModelProxy;
  commercialModelProxy = null;
  await modelProxy?.stop();
}

async function startApplication() {
  await prepareHermesRuntime();
  const secureDirectory = join(app.getPath("userData"), "secure");
  const client = new CommercialApiClient({
    baseUrl: resolveCommercialGatewayUrl(),
    sessionStore: new EncryptedFileCommercialSessionStore(
      join(secureDirectory, "commercial-session.bin"),
      safeStorage,
    ),
  });
  const deviceIdentity = new EncryptedFileCommercialDeviceIdentity(
    join(secureDirectory, "commercial-device.bin"),
    safeStorage,
  );
  const modelAccessStore = new EncryptedFileCommercialModelAccessStore(
    join(secureDirectory, "commercial-model-access.bin"),
    safeStorage,
  );
  commercialModelProxy = new CommercialModelProxy(client, deviceIdentity);
  await commercialModelProxy.start();
  const runtimeDependencies = new RuntimeDependencyManager(app.getPath("userData"));
  backend = new LocalBackend({
    repositoryRoot: REPO_ROOT,
    serveFrontend: false,
    runtimeDependencyPaths: runtimeDependencies.paths,
    restartOnUnexpectedExit: true,
    environment: {
      AI_ANIME_CLOUD_PROXY_BASE_URL: commercialModelProxy.baseUrl,
      AI_ANIME_CLOUD_PROXY_TOKEN: commercialModelProxy.token,
      AI_ANIME_SHARP_MODEL_URL:
        `${COMMERCIAL_RUNTIME_DEPENDENCIES_URL}/models/sharp/sharp_2572gikvuh.pt`,
    },
  });
  try {
    await backend.start();
    installBackendHeader(backend);
    registerRuntimeDependencyIpc(
      ipcMain,
      runtimeDependencies,
      (senderId) =>
        Boolean(
          mainWindow &&
            !mainWindow.isDestroyed() &&
            mainWindow.webContents.id === senderId,
        ),
    );
    registerCommercialGatewayIpc(
      backend,
      client,
      deviceIdentity,
      modelAccessStore,
    );
    viteProcess = startVite(backend);
    await waitForVite(viteProcess);
    await createMainWindow();
  } catch (error) {
    await stopServices();
    throw error;
  }
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
  if (quitting || (!backend && !viteProcess && !commercialModelProxy)) return;
  event.preventDefault();
  quitting = true;
  void stopServices().finally(() => app.quit());
});

app.on("window-all-closed", () => app.quit());
