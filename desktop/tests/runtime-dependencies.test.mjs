import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  RuntimeDependencyManager,
  runtimeDependencyManifestUrl,
} from "../src/runtime-dependencies.ts";

test("runtime dependency manifest defaults to the domestic release host", () => {
  assert.equal(
    runtimeDependencyManifestUrl("win32", "x64", {}),
    "https://aianime.122-193-11-199.sslip.io/api/v1/client/runtime-dependencies/win32-x64/manifest.json",
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
    const unsupported = await new RuntimeDependencyManager(root, {
      platform: "linux",
      arch: "x64",
    }).status();
    assert.equal(unsupported.state, "unsupported");
    assert.equal(unsupported.supported, false);

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
