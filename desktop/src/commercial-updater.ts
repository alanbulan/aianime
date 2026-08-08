// Copyright (c) 2026 AI anime

import type { CommercialReleaseUpdateFeed } from "./commercial-api-client.js";

type Identifier = string | number;

interface UpdateCheckResultLike {
  isUpdateAvailable: boolean;
  updateInfo: { version: string };
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
}

export interface CommercialUpdateDownloadResult {
  version: string;
}

export class CommercialDesktopUpdater {
  private downloadedVersion: string | null = null;

  constructor(
    private readonly updater: ElectronUpdaterLike,
    private readonly resolveFeed: (
      artifactId: Identifier,
    ) => Promise<CommercialReleaseUpdateFeed>,
  ) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.disableDifferentialDownload = true;
    updater.disableWebInstaller = true;
  }

  async download(
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

    const downloadedFiles = await this.updater.downloadUpdate();
    if (downloadedFiles.length === 0) {
      throw new Error("更新包下载失败");
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
