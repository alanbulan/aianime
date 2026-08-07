// Copyright (c) 2026 AI anime

import { join, resolve, sep } from "node:path";
import { hostname, tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  session,
  shell,
} from "electron";
import { LocalBackend } from "./backend.js";
import { EncryptedFileCommercialDeviceIdentity } from "./commercial-device.js";
import { CommercialModelProxy } from "./commercial-model-proxy.js";
import { EncryptedFileCommercialModelAccessStore } from "./commercial-model-access.js";
import {
  CommercialApiClient,
  EncryptedFileCommercialSessionStore,
  registerCommercialIpc,
  resolveCommercialGatewayUrl,
  type CommercialSessionSummary,
} from "./commercial.js";
import {
  ArtifactVerificationError,
  downloadAndVerifyReleaseArtifact,
  verifyWindowsAuthenticodeSignature,
} from "./commercial-artifact.js";
import { releaseInstallerCommand } from "./platform-runtime.js";

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
const AUTH_COOKIE_NAME = "ai_anime_session";
const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

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

function registerCommercialGatewayIpc(
  localBackend: LocalBackend,
  client: CommercialApiClient,
  deviceIdentity: EncryptedFileCommercialDeviceIdentity,
  modelAccessStore: EncryptedFileCommercialModelAccessStore,
): void {
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
    onModelAccessChanged: (
      access,
      allowsCustomModels,
      cloudModelAssignments,
      modelCapabilities,
    ) =>
      localBackend.configureModelAccess({
        allowsCustomModels,
        mode: allowsCustomModels ? access.mode : "cloud",
        cloudModelAssignments: [...cloudModelAssignments],
        modelCapabilities: [...modelCapabilities],
        ...(allowsCustomModels && access.mode === "byok"
          ? {
              byokBaseUrl: access.byokBaseUrl,
              byokApiKey: access.byokApiKey,
              modelAssignments: access.byokModelAssignments,
            }
          : {}),
      }),
    onLoggedOut: () =>
      session.defaultSession.cookies.remove(
        localBackend.baseUrl,
        AUTH_COOKIE_NAME,
      ),
    releaseArtifactDownloader: async (metadata) =>
      downloadAndVerifyReleaseArtifact(metadata, {
        verifySignature: () => {
          throw new ArtifactVerificationError(
            "未配置制品签名公钥，拒绝安装",
          );
        },
        verifyAuthenticode: (filePath) =>
          verifyWindowsAuthenticodeSignature(filePath),
      }),
    installArtifact: async ({ filePath, sha256 }) => {
      const resolved = resolve(filePath);
      const artifactRoot = resolve(tmpdir(), "ai-anime-artifact-");
      if (!resolved.startsWith(`${artifactRoot}${sep}`)) {
        throw new ArtifactVerificationError(
          "安装程序路径不在制品下载目录内",
        );
      }
      const bytes = await readFile(resolved);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (digest !== sha256) {
        throw new ArtifactVerificationError(
          "安装程序 SHA-256 与下载结果不一致",
        );
      }
      const installer = releaseInstallerCommand(resolved);
      const child = spawn(installer.command, installer.args, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    },
    // 制品签名公钥未配置前，离线租约一律保持未验证（fail-closed）。
    leaseSigningKeys: {},
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
  backend = new LocalBackend({
    environment: {
      AI_ANIME_CLOUD_PROXY_BASE_URL: commercialModelProxy.baseUrl,
      AI_ANIME_CLOUD_PROXY_TOKEN: commercialModelProxy.token,
    },
  });
  try {
    await backend.start();
    installBackendHeader(backend);
    registerCommercialGatewayIpc(
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
