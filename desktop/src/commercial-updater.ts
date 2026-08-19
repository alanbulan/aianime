// Copyright (c) 2026 AI anime

import type { CommercialReleaseUpdateFeed } from "./commercial-api-client.js";

type Identifier = string | number;

interface UpdateCheckResultLike {
  isUpdateAvailable: boolean;
  updateInfo: { version: string };
}

interface UpdateDownloadProgressLike {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface ElectronUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  disableDifferentialDownload: boolean;
  disableWebInstaller: boolean;
  requestHeaders: Record<string, string | string[] | number | undefined> | null;
  setFeedURL(options: { provider: "generic"; url: string }): void;
  checkForUpdates(): Promise<UpdateCheckResultLike | null>;
  downloadUpdate(): Promise<string[]>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on?(
    event: "download-progress",
    listener: (progress: UpdateDownloadProgressLike) => void,
  ): unknown;
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
  private downloading = false;
  private inFlightDownload: Promise<CommercialUpdateDownloadResult> | null = null;

  constructor(
    private readonly updater: ElectronUpdaterLike,
    private readonly resolveFeed: (
      artifactId: Identifier,
    ) => Promise<CommercialReleaseUpdateFeed>,
    private readonly onDownloadProgress?: (
      progress: CommercialUpdateDownloadProgress,
    ) => void,
  ) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.disableDifferentialDownload = true;
    updater.disableWebInstaller = true;
    updater.on?.("download-progress", (progress) => {
      if (!this.downloading) return;
      this.onDownloadProgress?.(normalizeDownloadProgress(progress));
    });
  }

  async download(
    artifactId: Identifier,
  ): Promise<CommercialUpdateDownloadResult> {
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
    artifactId: Identifier,
  ): Promise<CommercialUpdateDownloadResult> {
    this.downloadedVersion = null;
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

    this.downloading = true;
    try {
      const downloadedFiles = await this.updater.downloadUpdate();
      if (downloadedFiles.length === 0) {
        throw new Error("更新包下载失败");
      }
    } finally {
      this.downloading = false;
    }
    this.downloadedVersion = check.updateInfo.version;
    return { version: check.updateInfo.version };
  }

  install(): void {
    if (!this.downloadedVersion) {
      throw new Error("没有已下载的更新包");
    }
    this.downloadedVersion = null;
    this.updater.quitAndInstall(false, true);
  }
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
