import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  isRuntimeDependencyDownloadUrlAllowed,
  registerRuntimeDependencyIpc,
  RUNTIME_DEPENDENCY_CHANNELS,
  RuntimeDependencyManager,
} from "../src/runtime-dependencies.ts";
import { runtimeDependencyManifestUrl } from "../src/runtime-dependency-manifest.ts";

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
    status: async (id) => ({ id, state: "not-installed" }),
    install: async (id, onProgress) => {
      onProgress({ id, phase: "manifest", message: "checking" });
      return { state: "ready" };
    },
  };

  registerRuntimeDependencyIpc(ipcMain, manager, (senderId) => senderId === 42);

  assert.deepEqual(
    await handlers.get(RUNTIME_DEPENDENCY_CHANNELS.status)({ sender }, "world"),
    { id: "world", state: "not-installed" },
  );
  assert.deepEqual(
    await handlers.get(RUNTIME_DEPENDENCY_CHANNELS.status)({ sender }, "worldModels"),
    { id: "worldModels", state: "not-installed" },
  );
  assert.deepEqual(
    await handlers.get(RUNTIME_DEPENDENCY_CHANNELS.install)({ sender }, "world"),
    { state: "ready" },
  );
  assert.deepEqual(progressEvents, [
    [
      RUNTIME_DEPENDENCY_CHANNELS.progress,
      { id: "world", phase: "manifest", message: "checking" },
    ],
  ]);
  await assert.rejects(
    handlers.get(RUNTIME_DEPENDENCY_CHANNELS.status)(
      { sender: { ...sender, id: 7 } },
      "world",
    ),
    /active desktop window/,
  );
  await assert.rejects(
    handlers.get(RUNTIME_DEPENDENCY_CHANNELS.status)({ sender }, "unknown"),
    /unknown runtime dependency/,
  );
});

test("runtime dependency manifest defaults to the domestic release host", () => {
  assert.equal(
    runtimeDependencyManifestUrl("world", "win32", "x64", {}),
    "https://aianime.mingcw.com/api/v1/client/runtime-dependencies/world/win32-x64/manifest.json",
  );
  assert.equal(
    runtimeDependencyManifestUrl("world", "darwin", "arm64", {
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
    const unsupported = await intelMacManager.status("world");
    assert.equal(unsupported.state, "unsupported");
    assert.equal(unsupported.supported, false);
    assert.match(unsupported.message, /Intel Mac 可正常使用主应用/);
    assert.match(unsupported.message, /不会下载或启动不兼容组件/);
    await assert.rejects(
      intelMacManager.install("world"),
      /当前平台没有可安装的导演世界 3D 运行环境/,
    );
    const unsupportedModels = await intelMacManager.status("worldModels");
    assert.equal(unsupportedModels.state, "unsupported");
    await assert.rejects(
      intelMacManager.install("worldModels"),
      /当前平台不支持导演世界大型模型/,
    );

    const uninstalled = await new RuntimeDependencyManager(root, {
      platform: "win32",
      arch: "x64",
    }).status("world");
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
        }).install("world"),
        /运行环境清单字段不完整/,
      );
      assert.equal(fetchCalls, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("matte dependency installs verified files into the stable desktop directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-anime-matte-runtime-"));
  const bytes = Buffer.from("local matte runtime fixture", "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const packageInfo = {
    version: "test-matte-1",
    files: [
      {
        relativePath: "models/Xenova/modnet/config.json",
        sizeBytes: bytes.byteLength,
        sha256,
        urls: ["https://fixtures.example/matte/config.json"],
      },
    ],
  };
  const corruptBytes = Buffer.alloc(bytes.byteLength, 0);
  const fetchCalls = [];
  packageInfo.files[0].urls = [
    "https://mirror.example/matte/config.json",
    "https://fixtures.example/matte/config.json",
  ];
  const fetchImpl = async (url) => {
    fetchCalls.push(String(url));
    if (new URL(url).pathname.endsWith("manifest.json")) {
      return Response.json({
        schemaVersion: 1,
        package: { id: "matte", platform: "win32", arch: "x64", ...packageInfo },
      });
    }
    return new Response(String(url).includes("mirror.example") ? corruptBytes : bytes);
  };
  try {
    const manager = new RuntimeDependencyManager(root, {
      platform: "win32",
      arch: "x64",
      mattePackage: packageInfo,
      fetchImpl,
    });
    assert.equal((await manager.status("matte")).state, "not-installed");

    const progress = [];
    const installed = await manager.install("matte", (entry) => progress.push(entry));

    assert.equal(installed.state, "ready");
    assert.equal(installed.id, "matte");
    assert.equal(
      await readFile(join(manager.paths.matteRoot, packageInfo.files[0].relativePath), "utf8"),
      bytes.toString("utf8"),
    );
    assert.ok(progress.every((entry) => entry.id === "matte"));
    assert.equal(progress.at(-1)?.phase, "complete");
    assert.deepEqual(fetchCalls, [
      runtimeDependencyManifestUrl("matte", "win32", "x64", {}, packageInfo.version),
      ...packageInfo.files[0].urls,
    ]);

    await writeFile(
      join(manager.paths.matteRoot, packageInfo.files[0].relativePath),
      "corrupt",
      "utf8",
    );
    const reloaded = new RuntimeDependencyManager(root, {
      platform: "win32",
      arch: "x64",
      mattePackage: packageInfo,
      fetchImpl,
    });
    assert.equal((await reloaded.status("matte")).state, "incomplete");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("world model dependency installs verified SHARP and DA-2 files centrally", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-anime-world-models-"));
  const sharpBytes = Buffer.from("sharp fixture", "utf8");
  const da2Bytes = Buffer.from("da2 fixture", "utf8");
  const packageInfo = {
    version: "test-world-models-1",
    files: [
      {
        relativePath: "models/sharp/sharp_2572gikvuh.pt",
        sizeBytes: sharpBytes.byteLength,
        sha256: createHash("sha256").update(sharpBytes).digest("hex"),
        urls: ["https://fixtures.example/world-models/sharp.pt"],
      },
      {
        relativePath: "models/da2/model.safetensors",
        sizeBytes: da2Bytes.byteLength,
        sha256: createHash("sha256").update(da2Bytes).digest("hex"),
        urls: ["https://fixtures.example/world-models/da2.safetensors"],
      },
    ],
  };
  const fetchImpl = async (url) => new URL(url).pathname.endsWith("manifest.json")
    ? Response.json({
      schemaVersion: 1,
      package: { id: "worldModels", platform: "win32", arch: "x64", ...packageInfo },
    })
    : new Response(String(url).endsWith("sharp.pt") ? sharpBytes : da2Bytes);
  try {
    const manager = new RuntimeDependencyManager(root, {
      platform: "win32",
      arch: "x64",
      worldModelsPackage: packageInfo,
      fetchImpl,
    });
    assert.equal((await manager.status("worldModels")).state, "not-installed");

    const progress = [];
    const installed = await manager.install(
      "worldModels",
      (entry) => progress.push(entry),
    );

    assert.equal(installed.state, "ready");
    assert.equal(installed.id, "worldModels");
    assert.equal(await readFile(manager.paths.sharpModelPath, "utf8"), "sharp fixture");
    assert.equal(
      await readFile(join(manager.paths.da2ModelRoot, "model.safetensors"), "utf8"),
      "da2 fixture",
    );
    assert.ok(progress.every((entry) => entry.id === "worldModels"));
    assert.equal(progress.at(-1)?.phase, "complete");
  } finally {
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
