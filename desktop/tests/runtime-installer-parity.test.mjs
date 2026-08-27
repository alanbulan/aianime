import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { RuntimeDependencyManager } from "../src/runtime-dependencies.ts";

const windowsOnly = { skip: process.platform !== "win32", timeout: 120_000 };

test(
  "desktop and PowerShell installers share download, verification, archive, and atomic replacement behavior",
  windowsOnly,
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "ai-anime-installer-parity-"));
    t.after(() => rm(root, { recursive: true, force: true }));

    const validArchive = await createRuntimeArchive(join(root, "valid"), false);
    const illegalArchive = await createRuntimeArchive(join(root, "illegal"), true);
    const pathShadow = await createFailingPathTar(join(root, "path-shadow"));
    const previousPath = process.env.PATH;
    process.env.PATH = [pathShadow, previousPath].filter(Boolean).join(delimiter);
    t.after(() => {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    });
    const fixture = await startFixtureServer(validArchive, illegalArchive);
    t.after(() => fixture.close());

    const successManifestUrl = `${fixture.origin}/manifest-success.json`;
    const managerRoot = join(root, "manager-success");
    const manager = new RuntimeDependencyManager(managerRoot, {
      platform: "win32",
      arch: "x64",
    });
    await seedCurrent(manager.paths.root, "manager-old");
    const managerStatus = await withManifest(successManifestUrl, () =>
      manager.install(),
    );
    assert.equal(managerStatus.state, "ready");
    assert.equal(existsSync(join(manager.paths.root, "manager-old")), false);
    await assertNoInstallerResidue(dirname(manager.paths.root));

    const powershellRoot = join(root, "powershell-success");
    await seedCurrent(join(powershellRoot, "current"), "powershell-old");
    const powershellResult = await runPowerShellInstaller({
      manifestUrl: successManifestUrl,
      installRoot: powershellRoot,
      logPath: join(root, "logs", "success.log"),
    });
    assert.equal(
      powershellResult.code,
      0,
      powershellResult.stderr || powershellResult.stdout,
    );
    assert.equal(
      existsSync(join(powershellRoot, "current", "powershell-old")),
      false,
    );
    await assertNoInstallerResidue(powershellRoot);

    const managerReceipt = await readReceipt(manager.paths.root);
    const powershellReceipt = await readReceipt(join(powershellRoot, "current"));
    assert.deepEqual(withoutInstallTime(powershellReceipt), withoutInstallTime(managerReceipt));
    assert.equal(fixture.hits.failedMirror, 2);
    assert.equal(fixture.hits.validArchive, 2);

    await assertRejectedInstallPreservesCurrent({
      root,
      name: "bad-sha",
      manifestUrl: `${fixture.origin}/manifest-bad-sha.json`,
      managerPattern: /SHA-256/,
    });
    await assertRejectedInstallPreservesCurrent({
      root,
      name: "illegal-entry",
      manifestUrl: `${fixture.origin}/manifest-illegal.json`,
      managerPattern: /非法路径/,
    });
  },
);

async function assertRejectedInstallPreservesCurrent({
  root,
  name,
  manifestUrl,
  managerPattern,
}) {
  const managerRoot = join(root, `manager-${name}`);
  const manager = new RuntimeDependencyManager(managerRoot, {
    platform: "win32",
    arch: "x64",
  });
  await seedCurrent(manager.paths.root, "keep-current");
  await assert.rejects(
    withManifest(manifestUrl, () => manager.install()),
    managerPattern,
  );
  assert.equal(existsSync(join(manager.paths.root, "keep-current")), true);
  await assertNoInstallerResidue(dirname(manager.paths.root));

  const powershellRoot = join(root, `powershell-${name}`);
  await seedCurrent(join(powershellRoot, "current"), "keep-current");
  const result = await runPowerShellInstaller({
    manifestUrl,
    installRoot: powershellRoot,
    logPath: join(root, "logs", `${name}.log`),
  });
  assert.notEqual(result.code, 0);
  assert.equal(
    existsSync(join(powershellRoot, "current", "keep-current")),
    true,
  );
  await assertNoInstallerResidue(powershellRoot);
}

async function createRuntimeArchive(root, illegal) {
  const payloadRoot = join(root, "payload");
  const archivePath = join(root, "world.tar.gz");
  await mkdir(payloadRoot, { recursive: true });
  if (illegal) {
    await mkdir(join(payloadRoot, "unexpected"), { recursive: true });
    await writeFile(join(payloadRoot, "unexpected", "payload.txt"), "unsafe\n");
    runChecked(windowsTarExecutable(), [
      "-czf",
      archivePath,
      "-C",
      payloadRoot,
      "unexpected",
    ]);
  } else {
    const sourcePath = join(root, "RuntimeStub.cs");
    const executablePath = join(root, "runtime-stub.exe");
    await writeFile(
      sourcePath,
      [
        "using System;",
        "public static class RuntimeStub {",
        "  public static int Main(string[] args) {",
        "    if (args.Length > 0 && args[0] == \"--runtime-smoke-check\")",
        "      Console.WriteLine(\"AI_ANIME_WORLD_RUNTIME_SMOKE\");",
        "    else",
        "      Console.WriteLine(\"Transform and Filter Gaussian Splats\");",
        "    return 0;",
        "  }",
        "}",
      ].join("\n"),
      "utf8",
    );
    const compiler = join(
      process.env.SystemRoot || "C:\\Windows",
      "Microsoft.NET",
      "Framework64",
      "v4.0.30319",
      "csc.exe",
    );
    runChecked(compiler, [
      "/nologo",
      "/target:exe",
      `/out:${executablePath}`,
      sourcePath,
    ]);
    const worldRuntime = join(
      payloadRoot,
      "world-runtime",
      "ai-anime-world-runtime.exe",
    );
    const splatNode = join(payloadRoot, "splat-transform", "node.exe");
    const splatCli = join(
      payloadRoot,
      "splat-transform",
      "node_modules",
      "@playcanvas",
      "splat-transform",
      "bin",
      "cli.mjs",
    );
    await mkdir(dirname(worldRuntime), { recursive: true });
    await mkdir(dirname(splatNode), { recursive: true });
    await mkdir(dirname(splatCli), { recursive: true });
    await copyFile(executablePath, worldRuntime);
    await copyFile(executablePath, splatNode);
    await writeFile(splatCli, "export {};\n", "utf8");
    runChecked(windowsTarExecutable(), [
      "-czf",
      archivePath,
      "-C",
      payloadRoot,
      "world-runtime",
      "splat-transform",
    ]);
  }
  const bytes = await readFile(archivePath);
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function createFailingPathTar(root) {
  await mkdir(root, { recursive: true });
  const sourcePath = join(root, "PathTar.cs");
  const executablePath = join(root, "tar.exe");
  await writeFile(
    sourcePath,
    [
      "using System;",
      "public static class PathTar {",
      "  public static int Main() {",
      "    Console.Error.WriteLine(\"PATH tar must not be used\");",
      "    return 87;",
      "  }",
      "}",
    ].join("\n"),
    "utf8",
  );
  runChecked(windowsCSharpCompiler(), [
    "/nologo",
    "/target:exe",
    `/out:${executablePath}`,
    sourcePath,
  ]);
  return root;
}

function windowsTarExecutable() {
  return join(
    process.env.SystemRoot || process.env.WINDIR || "C:\\Windows",
    "System32",
    "tar.exe",
  );
}

function windowsCSharpCompiler() {
  return join(
    process.env.SystemRoot || process.env.WINDIR || "C:\\Windows",
    "Microsoft.NET",
    "Framework64",
    "v4.0.30319",
    "csc.exe",
  );
}

async function startFixtureServer(validArchive, illegalArchive) {
  const hits = { failedMirror: 0, validArchive: 0, illegalArchive: 0 };
  let origin = "";
  const manifest = (archive, sha256 = archive.sha256) => ({
    schemaVersion: 1,
    package: {
      id: "world",
      version: "9.8.7",
      platform: "win32",
      arch: "x64",
      archive: "tar.gz",
      sha256,
      downloadSizeBytes: archive.bytes.byteLength,
      installedSizeBytes: archive.bytes.byteLength + 1,
      urls: [`${origin}/mirror-fail.tar.gz`, `${origin}/${archive === validArchive ? "valid" : "illegal"}.tar.gz`],
    },
  });
  const server = createServer((request, response) => {
    const path = new URL(request.url || "/", "http://localhost").pathname;
    if (path === "/mirror-fail.tar.gz") {
      hits.failedMirror += 1;
      response.writeHead(503).end("try next mirror");
      return;
    }
    if (path === "/valid.tar.gz") {
      hits.validArchive += 1;
      response.writeHead(200, {
        "Content-Type": "application/gzip",
        "Content-Length": validArchive.bytes.byteLength,
      });
      response.end(validArchive.bytes);
      return;
    }
    if (path === "/illegal.tar.gz") {
      hits.illegalArchive += 1;
      response.writeHead(200, {
        "Content-Type": "application/gzip",
        "Content-Length": illegalArchive.bytes.byteLength,
      });
      response.end(illegalArchive.bytes);
      return;
    }
    const manifests = {
      "/manifest-success.json": manifest(validArchive),
      "/manifest-bad-sha.json": manifest(validArchive, "0".repeat(64)),
      "/manifest-illegal.json": manifest(illegalArchive),
    };
    const value = manifests[path];
    if (!value) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(value));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    hits,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function runPowerShellInstaller({ manifestUrl, installRoot, logPath }) {
  const powershell = join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const scriptPath = fileURLToPath(
    new URL("../scripts/install-runtime-dependency.ps1", import.meta.url),
  );
  return await new Promise((resolve, reject) => {
    const child = spawn(
      powershell,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-ManifestUrl",
        manifestUrl,
        "-InstallRoot",
        installRoot,
        "-InstallLogPath",
        logPath,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function withManifest(url, action) {
  const previous = process.env.AI_ANIME_RUNTIME_MANIFEST_URL;
  process.env.AI_ANIME_RUNTIME_MANIFEST_URL = url;
  try {
    return await action();
  } finally {
    if (previous === undefined) delete process.env.AI_ANIME_RUNTIME_MANIFEST_URL;
    else process.env.AI_ANIME_RUNTIME_MANIFEST_URL = previous;
  }
}

async function seedCurrent(currentPath, marker) {
  await mkdir(currentPath, { recursive: true });
  await writeFile(join(currentPath, marker), "keep\n", "utf8");
}

async function readReceipt(currentPath) {
  return JSON.parse(await readFile(join(currentPath, "install.json"), "utf8"));
}

function withoutInstallTime(receipt) {
  const { installedAt: _, ...stable } = receipt;
  return stable;
}

async function assertNoInstallerResidue(dependencyRoot) {
  const entries = await readdir(dependencyRoot);
  assert.deepEqual(
    entries.filter((entry) =>
      [".world-", ".staging-", ".previous-"].some((prefix) =>
        entry.startsWith(prefix),
      ),
    ),
    [],
  );
}

function runChecked(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    `${command} failed: ${result.stderr || result.stdout}`,
  );
}
