import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";

import { CommercialDesktopUpdater } from "../src/commercial-updater.ts";
import { registerCommercialUpdateHandlers } from "../src/commercial-ipc-update-handlers.ts";

function fakeUpdater(overrides = {}) {
  return Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    disableDifferentialDownload: false,
    disableWebInstaller: false,
    requestHeaders: null,
    feed: null,
    installed: null,
    setFeedURL(value) {
      this.feed = value;
    },
    async checkForUpdates() {
      return {
        isUpdateAvailable: true,
        updateInfo: { version: "1.1.6", sparkleEdSignature: Buffer.alloc(64, 1).toString("base64") },
      };
    },
    async downloadUpdate() {
      this.emit("download-progress", {
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
  });
}

test("configures electron-updater and completes the standard update flow", async () => {
  const updater = fakeUpdater();
  const native = new EventEmitter();
  const resolvedArtifactIds = [];
  const progressEvents = [];
  const service = new CommercialDesktopUpdater(updater, native, async (artifactId) => {
    resolvedArtifactIds.push(artifactId);
    return {
      url: "https://gateway.test/api/v1/client/releases/updater/?artifactId=7",
      requestHeaders: { Authorization: "Bearer token" },
    };
  }, (progress) => progressEvents.push(progress), "win32");

  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.disableDifferentialDownload, true);
  assert.equal(updater.disableWebInstaller, true);

  await assert.rejects(() => service.install(), /\u6ca1\u6709\u5df2\u4e0b\u8f7d/);
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

  const install = service.install();
  assert.deepEqual(updater.installed, {
    isSilent: false,
    isForceRunAfter: true,
  });
  native.emit("before-quit-for-update");
  await install;
});

test("rejects insecure feeds and missing updates", async () => {
  const insecure = new CommercialDesktopUpdater(fakeUpdater(), new EventEmitter(), async () => ({
    url: "http://gateway.test/updater/",
    requestHeaders: {},
  }));
  await assert.rejects(() => insecure.download(1), /HTTPS/);

  const unavailable = new CommercialDesktopUpdater(
    fakeUpdater({ checkForUpdates: async () => null }),
    new EventEmitter(),
    async () => ({
      url: "https://gateway.test/updater/",
      requestHeaders: {},
    }),
  );
  await assert.rejects(() => unavailable.download(1), /\u672a\u8fd4\u56de\u53ef\u5b89\u88c5/);
});

function installFixture(platform = "darwin", overrides = {}) {
  const native = Object.assign(new EventEmitter(), {
    checks: 0,
    checkForUpdates() { this.checks += 1; },
  });
  const updater = fakeUpdater(overrides);
  const mac = { calls: [], run: () => new Promise((resolve, reject) => { mac.resolve = resolve; mac.reject = reject; }) };
  const service = new CommercialDesktopUpdater(updater, native, async () => ({
    url: "https://gateway.test/updater/", requestHeaders: {},
  }), undefined, platform, (update) => { mac.calls.push(update); return mac.run(); });
  return { native, updater, service, mac };
}

test("macOS uses Sparkle without invoking Squirrel; concurrent installs share one attempt", async () => {
  const { native, updater, service, mac } = installFixture();
  await service.download("artifact");
  let completed = false;
  const first = service.install().then(() => { completed = true; });
  const second = service.install();
  assert.equal(native.checks, 0);
  assert.equal(updater.installed, null);
  await Promise.resolve();
  assert.equal(completed, false);
  await assert.rejects(service.download("other-artifact"), /正在安装/);
  assert.equal(mac.calls.length, 1);
  assert.equal(mac.calls[0].version, "1.1.6");
  assert.equal(updater.installed, null);
  await Promise.resolve();
  assert.equal(completed, false);
  mac.resolve();
  await Promise.all([first, second]);
  assert.equal(completed, true);
  assert.equal(native.listenerCount("update-downloaded"), 0);
  assert.equal(native.listenerCount("before-quit-for-update"), 0);
  assert.equal(updater.listenerCount("error"), 0);
  await assert.rejects(service.install(), /没有已下载/);
});

test("asynchronous Sparkle signature failure reaches IPC; repeated attempts remain safe", async () => {
  const { native, updater, service, mac } = installFixture();
  await service.download("artifact");
  const handlers = new Map();
  registerCommercialUpdateHandlers({
    channels: { installUpdate: "install" }, client: {},
    options: { releaseUpdater: service },
    handle: (channel, callback) => handlers.set(channel, callback),
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = handlers.get("install")();
    let settled = false;
    const failed = assert.rejects(result, (error) => {
      settled = true;
      assert.equal(error.code, "UPDATE_SIGNATURE_INVALID");
      assert.doesNotMatch(error.message, /secret|private-path/);
      return true;
    });
    await Promise.resolve();
    assert.equal(settled, false);
    mac.reject(new Error("Code signature at private-path invalid https://example.test/?token=secret"));
    await failed;
    assert.equal(updater.installed, null);
    assert.equal(updater.listenerCount("error"), 0);
    assert.equal(native.listenerCount("update-downloaded"), 0);
    assert.equal(native.listenerCount("before-quit-for-update"), 0);
  }
  const retry = handlers.get("install")();
  await Promise.resolve();
  mac.resolve();
  assert.deepEqual(await retry, { accepted: true });
  assert.equal(mac.calls.length, 3);
  assert.equal(native.checks, 0);
});

test("Windows asynchronous install failures reject instead of reporting acceptance", async () => {
  const { native, updater, service } = installFixture("win32");
  await service.download("artifact");
  const result = service.install();
  const failed = assert.rejects(result, { code: "UPDATE_INSTALL_FAILED" });
  updater.emit("error", new Error("installer failed"));
  await failed;
  assert.equal(native.checks, 0);
  const retry = service.install();
  native.emit("before-quit-for-update");
  await retry;
});

test("native synchronous read-only failures reject and remove pending listeners", async () => {
  const { native, updater, service, mac } = installFixture();
  mac.run = () => { throw new Error("Cannot update in a read-only volume"); };
  await service.download("artifact");
  await assert.rejects(service.install(), { code: "UPDATE_READ_ONLY" });
  assert.equal(native.listenerCount("update-downloaded"), 0);
  assert.equal(native.listenerCount("before-quit-for-update"), 0);
  assert.equal(updater.listenerCount("error"), 0);
});

test("macOS refuses unsigned manifests before downloading and never falls back to Squirrel", async () => {
  const { updater, service } = installFixture("darwin", {
    checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: "1.1.6" } }),
    downloadUpdate: async () => { assert.fail("must not download unsigned updates"); },
  });
  await assert.rejects(service.download("artifact"), /signature/);
  assert.equal(updater.installed, null);
});
