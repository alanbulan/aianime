// Copyright (c) 2026 AI anime

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import electronUpdater from "electron-updater";
import { LocalBackend } from "./backend.js";
import { EncryptedFileCommercialDeviceIdentity } from "./commercial-device.js";
import {
  CommercialModelProxy,
  modelRoutingSnapshot,
  type ModelRouteAuditEntry,
} from "./commercial-model-proxy.js";
import { EncryptedFileCommercialModelAccessStore } from "./commercial-model-access.js";
import { saveCommercialInvocationResult } from "./commercial-invocation-result.js";
import {
  CommercialApiClient,
  COMMERCIAL_RUNTIME_DEPENDENCIES_URL,
  EncryptedFileCommercialRememberedLoginStore,
  EncryptedFileCommercialSessionStore,
  registerCommercialIpc,
  resolveCommercialGatewayUrl,
  type CommercialSessionSummary,
} from "./commercial.js";
import { COMMERCIAL_LEASE_SIGNING_KEYS } from "./commercial-trust.js";
import { CommercialDesktopUpdater } from "./commercial-updater.js";
import { COMMERCIAL_CHANNELS } from "./commercial-ipc.js";
import {
  RUNTIME_DEPENDENCY_CHANNELS,
  RuntimeDependencyManager,
} from "./runtime-dependencies.js";

let mainWindow: BrowserWindow | null = null;
let backend: LocalBackend | null = null;
let commercialModelProxy: CommercialModelProxy | null = null;
let quitting = false;
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
const CONTENT_SECURITY_POLICY = [
  "default-src 'self';",
  "script-src 'self';",
  "style-src 'self' 'unsafe-inline';",
  "img-src 'self' data: blob: https:;",
  "media-src 'self' blob:;",
  "font-src 'self' data:;",
  "connect-src 'self';",
  "worker-src 'self' blob:;",
  "frame-ancestors 'none';",
  "base-uri 'self';",
  "form-action 'self';",
  "object-src 'none';",
].join(" ");
const AUTH_COOKIE_NAME = "ai_anime_session";
const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function appendModelRouteAudit(
  logPath: string,
  entry: ModelRouteAuditEntry,
): void {
  void mkdir(dirname(logPath), { recursive: true })
    .then(() => appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8"))
    .catch((error) => {
      console.warn(
        "[commercial] failed to append model route audit:",
        error instanceof Error ? error.message : String(error),
      );
    });
}

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

function installMediaPermissions(localBackend: LocalBackend): void {
  const isTrustedWindow = (senderId: number | undefined): boolean =>
    Boolean(
      senderId !== undefined &&
        mainWindow &&
        !mainWindow.isDestroyed() &&
        mainWindow.webContents.id === senderId,
    );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) =>
      permission === "media" &&
      details.mediaType === "audio" &&
      details.isMainFrame &&
      isTrustedWindow(webContents?.id) &&
      isSameOrigin(requestingOrigin, localBackend.baseUrl),
  );
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
      callback(
        permission === "media" &&
          details.isMainFrame &&
          isTrustedWindow(webContents.id) &&
          isSameOrigin(details.requestingUrl, localBackend.baseUrl) &&
          mediaTypes?.length === 1 &&
          mediaTypes[0] === "audio",
      );
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
  ipcMain.handle(CLIPBOARD_CHANNELS.writeText, (event, value: unknown) => {
    if (!activeWindow(event.sender.id)) {
      throw new Error("clipboard sender is not the active desktop window");
    }
    if (typeof value !== "string") {
      throw new TypeError("clipboard value must be a string");
    }
    clipboard.writeText(value);
  });
}

function registerRuntimeDependencyIpc(manager: RuntimeDependencyManager): void {
  const requireActiveWindow = (senderId: number): void => {
    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      mainWindow.webContents.id !== senderId
    ) {
      throw new Error("runtime dependency sender is not the active desktop window");
    }
  };
  ipcMain.handle(RUNTIME_DEPENDENCY_CHANNELS.status, async (event) => {
    requireActiveWindow(event.sender.id);
    return await manager.status();
  });
  ipcMain.handle(RUNTIME_DEPENDENCY_CHANNELS.install, async (event) => {
    requireActiveWindow(event.sender.id);
    const sender = event.sender;
    return await manager.install((progress) => {
      if (!sender.isDestroyed()) {
        sender.send(RUNTIME_DEPENDENCY_CHANNELS.progress, progress);
      }
    });
  });
}

function desktopSessionCookieValue(username: string): string {
  return `desktop.${Buffer.from(username, "utf8").toString("base64url")}`;
}

async function setDesktopSessionCookie(
  origin: string,
  cloudSession: CommercialSessionSummary,
): Promise<void> {
  await session.defaultSession.cookies.set({
    url: origin,
    name: AUTH_COOKIE_NAME,
    value: desktopSessionCookieValue(cloudSession.user.username),
    path: "/",
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    expirationDate: Date.now() / 1000 + AUTH_COOKIE_MAX_AGE_SECONDS,
  });
}

async function registerCommercialGatewayIpc(
  localBackend: LocalBackend,
  client: CommercialApiClient,
  deviceIdentity: EncryptedFileCommercialDeviceIdentity,
  modelAccessStore: EncryptedFileCommercialModelAccessStore,
): Promise<void> {
  const device = await deviceIdentity.summary();
  const releaseUpdater = new CommercialDesktopUpdater(
    electronUpdater.autoUpdater,
    (artifactId) => client.releaseUpdateFeed(artifactId),
    (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          COMMERCIAL_CHANNELS.updateDownloadProgress,
          progress,
        );
      }
    },
  );
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
      setDesktopSessionCookie(localBackend.baseUrl, cloudSession),
    onModelAccessChanged: async (
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
      await localBackend.configureModelAccess({
        allowsCustomModels,
        mode: "mixed",
        modelAssignments: modelRoutingSnapshot(routing),
        modelCapabilities: [...modelCapabilities],
      });
    },
    onLoggedOut: () =>
      session.defaultSession.cookies.remove(
        localBackend.baseUrl,
        AUTH_COOKIE_NAME,
      ),
    releaseUpdater,
    saveInvocationResult: (id) =>
      saveCommercialInvocationResult(client, id, async (suggestedName) => {
        const result = mainWindow
          ? await dialog.showSaveDialog(mainWindow, { defaultPath: suggestedName })
          : await dialog.showSaveDialog({ defaultPath: suggestedName });
        return result.canceled ? null : result.filePath ?? null;
      }),
    leaseSigningKeys: COMMERCIAL_LEASE_SIGNING_KEYS,
    devicePublicKeyHash: device.publicKeyHash,
  });
}

function commercialPlatform(): string {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  return process.platform;
}

function commercialArchitecture(): string {
  return process.arch === "x64" ? "x86_64" : process.arch;
}

async function startApplication(): Promise<void> {
  const secureDirectory = join(app.getPath("userData"), "secure");
  const commercialGatewayUrl = resolveCommercialGatewayUrl();
  const client = new CommercialApiClient({
    baseUrl: commercialGatewayUrl,
    sessionStore: new EncryptedFileCommercialSessionStore(
      join(secureDirectory, "commercial-session.bin"),
      safeStorage,
    ),
    rememberedLoginStore: new EncryptedFileCommercialRememberedLoginStore(
      join(secureDirectory, "commercial-remembered-login.bin"),
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
  const modelRouteLogPath = join(
    app.getPath("userData"),
    "logs",
    "model-routing.log",
  );
  commercialModelProxy = new CommercialModelProxy(
    client,
    deviceIdentity,
    (entry) => appendModelRouteAudit(modelRouteLogPath, entry),
  );
  await commercialModelProxy.start();
  const runtimeDependencies = new RuntimeDependencyManager(app.getPath("userData"));
  backend = new LocalBackend({
    runtimeDependencyPaths: runtimeDependencies.paths,
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
    installMediaPermissions(backend);
    registerRuntimeDependencyIpc(runtimeDependencies);
    await registerCommercialGatewayIpc(
      backend,
      client,
      deviceIdentity,
      modelAccessStore,
    );
    await createMainWindow(backend);
  } catch (error) {
    await stopApplication();
    throw error;
  }
}

async function stopApplication(): Promise<void> {
  const localBackend = backend;
  backend = null;
  await localBackend?.stop();
  const modelProxy = commercialModelProxy;
  commercialModelProxy = null;
  await modelProxy?.stop();
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
  if ((!backend && !commercialModelProxy) || quitting) return;
  event.preventDefault();
  quitting = true;
  void stopApplication().finally(() => app.quit());
});

app.on("window-all-closed", () => app.quit());
