// Copyright (c) 2026 AI anime

import type { EventEmitter } from "node:events";
import { assertSparkleSignature, type SparkleUpdate } from "./commercial-sparkle-installer.js";
import {
  CommercialApiError,
  type CommercialReleaseUpdateFeed,
} from "./commercial-api-client.js";

interface UpdateCheckResultLike {
  isUpdateAvailable: boolean;
  updateInfo: { version: string; sparkleEdSignature?: string };
}

interface UpdateDownloadProgressLike {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface ElectronUpdaterLike
  extends Pick<EventEmitter, "on" | "once" | "removeListener"> {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  disableDifferentialDownload: boolean;
  disableWebInstaller: boolean;
  requestHeaders: Record<string, string | string[] | number | undefined> | null;
  setFeedURL(options: { provider: "generic"; url: string }): void;
  checkForUpdates(): Promise<UpdateCheckResultLike | null>;
  downloadUpdate(): Promise<string[]>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface NativeUpdaterLike
  extends Pick<EventEmitter, "once" | "removeListener"> {
}

export interface CommercialUpdateDownloadResult {
  version: string;
}

export interface CommercialUpdateDownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export class CommercialDesktopUpdater {
  private downloadedVersion: string | null = null;
  private sparkleUpdate: SparkleUpdate | null = null;
  private downloading = false;
  private inFlightDownload: Promise<CommercialUpdateDownloadResult> | null = null;
  private inFlightInstall: Promise<void> | null = null;

  constructor(
    private readonly updater: ElectronUpdaterLike,
    private readonly nativeUpdater: NativeUpdaterLike,
    private readonly resolveFeed: (
      artifactId: string,
    ) => Promise<CommercialReleaseUpdateFeed>,
    private readonly onDownloadProgress?: (
      progress: CommercialUpdateDownloadProgress,
    ) => void,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly installMacUpdate?: (update: SparkleUpdate) => Promise<void>,
    private readonly prepareInstall?: () => Promise<void>,
  ) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.disableDifferentialDownload = true;
    updater.disableWebInstaller = true;
    updater.on("download-progress", (progress: UpdateDownloadProgressLike) => {
      if (!this.downloading) return;
      this.onDownloadProgress?.(normalizeDownloadProgress(progress));
    });
  }

  async download(
    artifactId: string,
  ): Promise<CommercialUpdateDownloadResult> {
    if (this.inFlightInstall) throw new Error("更新正在安装，请勿重复下载");
    // The whole download mutates shared updater state (feed URL, request
    // headers, progress routing). A second concurrent call — a double-clicked
    // update button — would repoint the feed mid-flight and the two runs could
    // report each other's version.
    if (this.inFlightDownload) return this.inFlightDownload;
    const run = this.runDownload(artifactId);
    this.inFlightDownload = run;
    try {
      return await run;
    } finally {
      this.inFlightDownload = null;
    }
  }

  private async runDownload(
    artifactId: string,
  ): Promise<CommercialUpdateDownloadResult> {
    this.downloadedVersion = null;
    this.sparkleUpdate = null;
    const feed = await this.resolveFeed(artifactId);
    const feedUrl = new URL(feed.url);
    if (feedUrl.protocol !== "https:") {
      throw new Error("更新地址必须使用 HTTPS");
    }

    this.updater.requestHeaders = { ...feed.requestHeaders };
    this.updater.setFeedURL({ provider: "generic", url: feedUrl.toString() });
    const check = await this.updater.checkForUpdates();
    if (!check?.isUpdateAvailable) {
      throw new Error("云端未返回可安装的新版本");
    }
    if (this.platform === "darwin") assertSparkleSignature(check.updateInfo.sparkleEdSignature);

    this.downloading = true;
    try {
      const downloadedFiles = await this.updater.downloadUpdate();
      if (downloadedFiles.length === 0) {
        throw new Error("更新包下载失败");
      }
      if (this.platform === "darwin") this.sparkleUpdate = {
        version: check.updateInfo.version,
        archivePath: downloadedFiles[0]!,
        edSignature: check.updateInfo.sparkleEdSignature!,
      };
    } finally {
      this.downloading = false;
    }
    this.downloadedVersion = check.updateInfo.version;
    return { version: check.updateInfo.version };
  }

  async install(): Promise<void> {
    if (this.inFlightInstall) return this.inFlightInstall;
    if (!this.downloadedVersion) {
      throw new Error("没有已下载的更新包");
    }
    const run = this.runInstall();
    this.inFlightInstall = run;
    try {
      await run;
      this.downloadedVersion = null;
      this.sparkleUpdate = null;
    } finally {
      this.inFlightInstall = null;
    }
  }

  private runInstall(): Promise<void> {
    if (this.platform === "darwin") {
      return Promise.resolve().then(() => {
        if (!this.sparkleUpdate || !this.installMacUpdate) throw new Error("Sparkle installer unavailable");
        return this.installMacUpdate(this.sparkleUpdate);
      }).catch((error: unknown) => { throw installError(error); });
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.updater.removeListener("error", onError);
        this.nativeUpdater.removeListener("before-quit-for-update", onQuit);
      };
      const onError = (error: unknown) => {
        cleanup();
        reject(installError(error));
      };
      const onQuit = () => {
        cleanup();
        resolve();
      };
      const launchInstaller = () => {
        try {
          this.updater.quitAndInstall(false, true);
        } catch (error) {
          onError(error);
        }
      };
      const onReady = () => {
        if (!this.prepareInstall) {
          launchInstaller();
          return;
        }
        // electron-updater starts the NSIS process before it asks Electron
        // to quit. Stop all application-owned services first so the old
        // uninstaller never races a still-running backend or proxy.
        void Promise.resolve()
          .then(() => this.prepareInstall?.())
          .then(launchInstaller)
          .catch(onError);
      };
      this.updater.once("error", onError);
      this.nativeUpdater.once("before-quit-for-update", onQuit);
      void onReady();
    });
  }
}

function installError(error: unknown): CommercialApiError {
  const message = error instanceof Error ? error.message : String(error);
  // Native errors may contain private cache paths/feed URLs. Only project a
  // known failure category across IPC, never the raw native error payload.
  if (/signature|code.?sign|improperly signed|Ed25519/i.test(message)) {
    return new CommercialApiError("macOS 拒绝了更新包的签名，请手动安装新版客户端", {
      code: "UPDATE_SIGNATURE_INVALID",
    });
  }
  if (/read.only|read only|只读/i.test(message)) {
    return new CommercialApiError("应用位于只读位置，请移至 Applications 后重试", {
      code: "UPDATE_READ_ONLY",
    });
  }
  return new CommercialApiError("系统未能安装更新，请重试或手动安装新版客户端", {
    code: "UPDATE_INSTALL_FAILED",
  });
}

function normalizeDownloadProgress(
  progress: UpdateDownloadProgressLike,
): CommercialUpdateDownloadProgress {
  return {
    percent: finiteBounded(progress.percent, 0, 100),
    transferred: finiteBounded(
      progress.transferred,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    total: finiteBounded(progress.total, 0, Number.MAX_SAFE_INTEGER),
    bytesPerSecond: finiteBounded(
      progress.bytesPerSecond,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

function finiteBounded(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
