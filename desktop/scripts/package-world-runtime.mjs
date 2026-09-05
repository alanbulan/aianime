// Copyright (c) 2026 AI anime

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const desktopRoot = process.cwd();
const platform = process.platform;
const arch = process.arch;
const tarExecutable = platform === "win32"
  ? join(
      process.env.SystemRoot || process.env.WINDIR || "C:\\Windows",
      "System32",
      "tar.exe",
    )
  : "tar";
if (!((platform === "win32" && arch === "x64") || (platform === "darwin" && arch === "arm64"))) {
  throw new Error(`unsupported world runtime package target: ${platform}-${arch}`);
}
if (platform === "win32" && !existsSync(tarExecutable)) {
  throw new Error(`Windows system tar.exe is missing: ${tarExecutable}`);
}

const runtimeVersions = JSON.parse(
  await readFile(join(desktopRoot, "runtime-version.json"), "utf8"),
);
const version = String(runtimeVersions.world || "").trim();
if (!/^\d+\.\d+\.\d+$/u.test(version)) {
  throw new Error(`invalid world runtime version: ${version || "missing"}`);
}
const worldSource = resolve(
  desktopRoot,
  "world-runtime-dist",
  "ai-anime-world-runtime",
);
const splatSource = resolve(desktopRoot, "runtime", "splat-transform");
const worldExecutable = join(
  worldSource,
  platform === "win32" ? "ai-anime-world-runtime.exe" : "ai-anime-world-runtime",
);
const splatNode = join(
  splatSource,
  platform === "win32" ? "node.exe" : "node",
);
const splatCli = join(
  splatSource,
  "node_modules",
  "@playcanvas",
  "splat-transform",
  "bin",
  "cli.mjs",
);
for (const required of [worldExecutable, splatNode, splatCli]) {
  if (!existsSync(required)) throw new Error(`world runtime package input missing: ${required}`);
}

const targetDirectory = resolve(desktopRoot, "runtime-release", `${platform}-${arch}`);
await mkdir(targetDirectory, { recursive: true });
const archiveName = `AI-anime-world-runtime-${version}-${platform}-${arch}.tar.gz`;
const archivePath = join(targetDirectory, archiveName);
const staging = await mkdtemp(join(tmpdir(), "ai-anime-world-runtime-"));
try {
  await symlink(worldSource, join(staging, "world-runtime"), "junction");
  await symlink(splatSource, join(staging, "splat-transform"), "junction");
  const result = spawnSync(
    tarExecutable,
    ["-czhf", archivePath, "-C", staging, "world-runtime", "splat-transform"],
    { encoding: "utf8", timeout: 3_600_000, windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`tar failed (${String(result.status)}): ${result.stderr || result.stdout}`);
  }
} finally {
  await rm(staging, { recursive: true, force: true });
}

async function directorySize(path) {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) total += await directorySize(child);
    else if (entry.isFile()) total += (await stat(child)).size;
  }
  return total;
}

async function sha256(path) {
  const hash = createHash("sha256");
  await new Promise((resolveHash, rejectHash) => {
    const input = createReadStream(path);
    input.on("data", (chunk) => hash.update(chunk));
    input.once("end", resolveHash);
    input.once("error", rejectHash);
  });
  return hash.digest("hex");
}

const archiveStats = await stat(archivePath);
const installedSizeBytes =
  (await directorySize(worldSource)) + (await directorySize(splatSource));
const digest = await sha256(archivePath);
const manifest = {
  schemaVersion: 1,
  package: {
    id: "world",
    version,
    platform,
    arch,
    archive: "tar.gz",
    sha256: digest,
    downloadSizeBytes: archiveStats.size,
    installedSizeBytes,
    objectKey: `runtime-dependencies/world/${version}/${platform}-${arch}/${archiveName}`,
  },
};
const manifestPath = join(targetDirectory, "artifact.json");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  `World runtime package ready: ${archivePath} (${archiveStats.size} bytes), manifest: ${manifestPath}`,
);
