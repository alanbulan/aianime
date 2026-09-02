import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  isRuntimeDependencyDownloadUrlAllowed,
  registerRuntimeDependencyIpc,
  RUNTIME_DEPENDENCY_CHANNELS,
  RuntimeDependencyManager,
  runtimeDependencyManifestUrl,
} from "../src/runtime-dependencies.ts";

test("runtime dependency downloads allow HTTPS and all loopback URL forms", () => {
  assert.equal(
    isRuntimeDependencyDownloadUrlAllowed("https://downloads.example/world.tar.gz"),
    true,
  );
  assert.equal(
    isRuntimeDependencyDownloadUrlAllowed("http://127.0.0.1:8080/world.tar.gz"),
    true,
  );
  assert.equal(
    isRuntimeDependencyDownloadUrlAllowed("http://localhost:8080/world.tar.gz"),
    true,
  );
  assert.equal(
    isRuntimeDependencyDownloadUrlAllowed("http://[::1]:8080/world.tar.gz"),
    true,
  );
  assert.equal(
    isRuntimeDependencyDownloadUrlAllowed("http://downloads.example/world.tar.gz"),
    false,
  );
});

function validRuntimeManifest() {
  return {
    schemaVersion: 1,
    package: {
      id: "world",
      version: "1.0.0",
      platform: "win32",
      arch: "x64",
      archive: "tar.gz",
      sha256: "a".repeat(64),
      downloadSizeBytes: 1024,
      installedSizeBytes: 2048,
      urls: ["https://example.com/world.tar.gz"],
    },
  };
}

test("runtime dependency IPC registers status/install handlers and checks the active window", async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
  };
  const progressEvents = [];
  const sender = {
    id: 42,
    isDestroyed: () => false,
    send: (channel, payload) => progressEvents.push([channel, payload]),
  };
  const manager = {
    status: async () => ({ state: "not-installed" }),
    install: async (onProgress) => {
      onProgress({ phase: "manifest", message: "checking" });
      return { state: "ready" };
    },
  };

  registerRuntimeDependencyIpc(ipcMain, manager, (senderId) => senderId === 42);

  assert.deepEqual(
    await handlers.get(RUNTIME_DEPENDENCY_CHANNELS.status)({ sender }),
    { state: "not-installed" },
  );
  assert.deepEqual(
    await handlers.get(RUNTIME_DEPENDENCY_CHANNELS.install)({ sender }),
    { state: "ready" },
  );
  assert.deepEqual(progressEvents, [
    [
      RUNTIME_DEPENDENCY_CHANNELS.progress,
      { phase: "manifest", message: "checking" },
    ],
  ]);
  await assert.rejects(
    handlers.get(RUNTIME_DEPENDENCY_CHANNELS.status)({
      sender: { ...sender, id: 7 },
    }),
    /active desktop window/,
  );
});

test("runtime dependency manifest defaults to the domestic release host", () => {
  assert.equal(
    runtimeDependencyManifestUrl("win32", "x64", {}),
    "https://aianime.mingcw.com/api/v1/client/runtime-dependencies/win32-x64/manifest.json",
  );
  assert.equal(
    runtimeDependencyManifestUrl("darwin", "arm64", {
      AI_ANIME_RUNTIME_MANIFEST_URL:
        "https://mirror.example.cn/{platform}/{arch}/manifest.json",
    }),
    "https://mirror.example.cn/darwin/arm64/manifest.json",
  );
});

test("runtime dependency status distinguishes unsupported and uninstalled platforms", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-anime-runtime-test-"));
  try {
    const intelMacManager = new RuntimeDependencyManager(root, {
      platform: "darwin",
      arch: "x64",
    });
    const unsupported = await intelMacManager.status();
    assert.equal(unsupported.state, "unsupported");
    assert.equal(unsupported.supported, false);
    assert.match(unsupported.message, /Intel Mac 可正常使用主应用/);
    assert.match(unsupported.message, /不会下载或启动不兼容组件/);
    await assert.rejects(
      intelMacManager.install(),
      /当前平台没有可安装的导演世界 3D 运行环境/,
    );

    const uninstalled = await new RuntimeDependencyManager(root, {
      platform: "win32",
      arch: "x64",
    }).status();
    assert.equal(uninstalled.state, "not-installed");
    assert.equal(uninstalled.installed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime dependency manifest rejects unsafe URLs and invalid sizes before download", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-anime-runtime-manifest-"));
  const originalFetch = globalThis.fetch;
  const invalidManifests = [
    { ...validRuntimeManifest(), package: { ...validRuntimeManifest().package, urls: [] } },
    {
      ...validRuntimeManifest(),
      package: {
        ...validRuntimeManifest().package,
        urls: ["http://example.com/world.tar.gz"],
      },
    },
    {
      ...validRuntimeManifest(),
      package: { ...validRuntimeManifest().package, downloadSizeBytes: 0 },
    },
    {
      ...validRuntimeManifest(),
      package: { ...validRuntimeManifest().package, installedSizeBytes: "2048" },
    },
  ];
  try {
    for (const manifest of invalidManifests) {
      let fetchCalls = 0;
      globalThis.fetch = async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify(manifest), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };
      await assert.rejects(
        new RuntimeDependencyManager(root, {
          platform: "win32",
          arch: "x64",
        }).install(),
        /运行环境清单字段不完整/,
      );
      assert.equal(fetchCalls, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("setup skips the optional runtime page when the current installation is complete", async () => {
  const installer = await readFile(
    new URL("../build/installer.nsh", import.meta.url),
    "utf8",
  );
  for (const requiredPath of [
    "install.json",
    "world-runtime\\ai-anime-world-runtime.exe",
    "splat-transform\\node.exe",
    "splat-transform\\node_modules\\@playcanvas\\splat-transform\\bin\\cli.mjs",
  ]) {
    assert.match(
      installer,
      new RegExp(`IfFileExists .*${requiredPath.replaceAll("\\", "\\\\")}`),
    );
  }
  assert.match(
    installer,
    /StrCpy \$AiAnimeInstallWorldRuntime \$\{BST_UNCHECKED\}\s+Abort\s+AiAnimeShowWorldRuntimePage:/,
  );
});
