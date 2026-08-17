import assert from "node:assert/strict";
import test from "node:test";

import { CommercialDesktopUpdater } from "../src/commercial-updater.ts";

function fakeUpdater(overrides = {}) {
  return {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    disableDifferentialDownload: false,
    disableWebInstaller: false,
    requestHeaders: null,
    feed: null,
    installed: null,
    progressListener: null,
    on(event, listener) {
      if (event === "download-progress") this.progressListener = listener;
    },
    setFeedURL(value) {
      this.feed = value;
    },
    async checkForUpdates() {
      return {
        isUpdateAvailable: true,
        updateInfo: { version: "1.1.6" },
      };
    },
    async downloadUpdate() {
      this.progressListener?.({
        percent: 42.4,
        transferred: 424,
        total: 1000,
        bytesPerSecond: 100,
      });
      return ["C:\\updates\\AI-anime-1.1.6-x64-setup.exe"];
    },
    quitAndInstall(isSilent, isForceRunAfter) {
      this.installed = { isSilent, isForceRunAfter };
    },
    ...overrides,
  };
}

test("configures electron-updater and completes the standard update flow", async () => {
  const updater = fakeUpdater();
  const resolvedArtifactIds = [];
  const progressEvents = [];
  const service = new CommercialDesktopUpdater(updater, async (artifactId) => {
    resolvedArtifactIds.push(artifactId);
    return {
      url: "https://gateway.test/api/v1/client/releases/updater/?artifactId=7",
      requestHeaders: { Authorization: "Bearer token" },
    };
  }, (progress) => progressEvents.push(progress));

  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.disableDifferentialDownload, true);
  assert.equal(updater.disableWebInstaller, true);

  assert.throws(() => service.install(), /\u6ca1\u6709\u5df2\u4e0b\u8f7d/);
  assert.deepEqual(await service.download(7), { version: "1.1.6" });
  assert.deepEqual(resolvedArtifactIds, [7]);
  assert.deepEqual(updater.feed, {
    provider: "generic",
    url: "https://gateway.test/api/v1/client/releases/updater/?artifactId=7",
  });
  assert.deepEqual(updater.requestHeaders, {
    Authorization: "Bearer token",
  });
  assert.deepEqual(progressEvents, [
    {
      percent: 42.4,
      transferred: 424,
      total: 1000,
      bytesPerSecond: 100,
    },
  ]);

  service.install();
  assert.deepEqual(updater.installed, {
    isSilent: false,
    isForceRunAfter: true,
  });
});

test("rejects insecure feeds and missing updates", async () => {
  const insecure = new CommercialDesktopUpdater(fakeUpdater(), async () => ({
    url: "http://gateway.test/updater/",
    requestHeaders: {},
  }));
  await assert.rejects(() => insecure.download(1), /HTTPS/);

  const unavailable = new CommercialDesktopUpdater(
    fakeUpdater({ checkForUpdates: async () => null }),
    async () => ({
      url: "https://gateway.test/updater/",
      requestHeaders: {},
    }),
  );
  await assert.rejects(() => unavailable.download(1), /\u672a\u8fd4\u56de\u53ef\u5b89\u88c5/);
});
