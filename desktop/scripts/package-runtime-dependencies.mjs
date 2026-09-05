// Copyright (c) 2026 AI anime

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MATTE_DEPENDENCY_PACKAGE } from "../src/matte-runtime-dependency.ts";
import { WORLD_MODELS_DEPENDENCY_PACKAGE } from "../src/world-models-runtime-dependency.ts";

const desktopRoot = resolve(import.meta.dirname, "..");
const target = `${process.platform}-${process.arch}`;
const versions = JSON.parse(await readFile(join(desktopRoot, "runtime-version.json"), "utf8"));
const outputRoot = join(desktopRoot, "runtime-release", `publish-${versions.world}-${target}`);
const objectsRoot = join(outputRoot, "objects");
const preparationOnly = process.argv.includes("--prepare-files-only");
const packages = [];
const checksums = [];
const userData = process.env.AI_ANIME_DEV_USER_DATA_DIR
  || (process.platform === "win32" && process.env.APPDATA
    ? join(process.env.APPDATA, "@ai-anime", "desktop") : undefined);

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function verified(path, expected) {
  const details = await stat(path).catch(() => null);
  return details?.isFile() && details.size === expected.sizeBytes
    && await sha256File(path) === expected.sha256;
}

async function download(file, destination) {
  const partial = `${destination}.part`;
  let lastError;
  for (const url of file.urls) {
    try {
      console.log(`获取 ${file.relativePath}（${new URL(url).hostname}）`);
      const response = await fetch(url, { signal: AbortSignal.timeout(3_600_000) });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      let received = 0;
      let lastReport = Date.now();
      const input = Readable.fromWeb(response.body);
      input.on("data", (chunk) => {
        received += chunk.length;
        if (received > file.sizeBytes) input.destroy(new Error("文件超过锁定大小"));
        if (Date.now() - lastReport >= 10_000) {
          console.log(`${file.relativePath}: ${(received / file.sizeBytes * 100).toFixed(1)}%`);
          lastReport = Date.now();
        }
      });
      await pipeline(input, createWriteStream(partial));
      if (!await verified(partial, file)) throw new Error("文件大小或 SHA-256 不匹配");
      await rename(partial, destination);
      return;
    } catch (error) {
      lastError = error;
      await rm(partial, { force: true });
      console.log(`资源地址不可用：${error.message}`);
    }
  }
  throw new Error(`${file.relativePath} 无法打包：${lastError?.message}`);
}

await mkdir(objectsRoot, { recursive: true });
for (const [id, directoryName, packageInfo, targets] of [
  ["matte", "matte", MATTE_DEPENDENCY_PACKAGE, ["win32-x64", "darwin-arm64", "darwin-x64"]],
  ["worldModels", "world-models", WORLD_MODELS_DEPENDENCY_PACKAGE, ["win32-x64", "darwin-arm64"]],
]) {
  const files = [];
  for (const file of packageInfo.files) {
    const objectKey = `runtime-dependencies/${id}/${packageInfo.version}/common/${file.relativePath}`;
    const destination = join(objectsRoot, objectKey);
    await mkdir(dirname(destination), { recursive: true });
    if (!await verified(destination, file)) {
      const local = userData && join(userData, "dependencies", directoryName, "current", file.relativePath);
      if (local && await verified(local, file)) {
        await copyFile(local, destination);
        console.log(`复用已校验资源：${file.relativePath}`);
      } else {
        await download(file, destination);
      }
    }
    files.push({
      relativePath: file.relativePath, sizeBytes: file.sizeBytes,
      sha256: file.sha256, objectKey,
    });
    checksums.push(`${file.sha256}  objects/${objectKey}`);
  }
  packages.push({
    targets,
    package: { id, version: packageInfo.version, files },
    ...(id === "worldModels" ? { notices: ["SHARP weights: research use only; see licenses/SHARP-LICENSE_MODEL.txt"] } : {}),
  });
}

if (preparationOnly) {
  console.log(`跨平台资源已准备：${outputRoot}`);
  process.exit(0);
}

const artifactRoot = join(desktopRoot, "runtime-release", target);
const artifact = JSON.parse(await readFile(join(artifactRoot, "artifact.json"), "utf8"));
const world = artifact.package;
if (artifact.schemaVersion !== 1 || world.id !== "world"
  || world.platform !== process.platform || world.arch !== process.arch
  || world.version !== versions.world || world.archive !== "tar.gz") {
  throw new Error("3D 运行环境构件不匹配；先执行 package:world-runtime");
}
const archiveName = `AI-anime-world-runtime-${world.version}-${target}.tar.gz`;
const expectedKey = `runtime-dependencies/world/${world.version}/${target}/${archiveName}`;
if (world.objectKey !== expectedKey) throw new Error("3D 运行环境对象路径不匹配");
const worldArchive = join(artifactRoot, archiveName);
const worldDestination = join(objectsRoot, world.objectKey);
const expectedWorld = { sizeBytes: world.downloadSizeBytes, sha256: world.sha256 };
if (!await verified(worldArchive, expectedWorld)) throw new Error("3D 运行环境构件校验失败");
await mkdir(dirname(worldDestination), { recursive: true });
if (!await verified(worldDestination, expectedWorld)) await copyFile(worldArchive, worldDestination);
packages.unshift({ targets: [target], package: world });
checksums.unshift(`${world.sha256}  objects/${world.objectKey}`);

const licenseSources = [
  ["SHARP-LICENSE_MODEL.txt", "https://raw.githubusercontent.com/apple/ml-sharp/main/LICENSE_MODEL"],
  ["SHARP-LICENSE.txt", "https://raw.githubusercontent.com/apple/ml-sharp/main/LICENSE"],
  ["DA2-LICENSE.txt", "https://raw.githubusercontent.com/EnVision-Research/DA-2/main/LICENSE"],
  ["MODNET-LICENSE.txt", "https://raw.githubusercontent.com/ZHKKKe/MODNet/master/LICENSE"],
  ["ONNXRUNTIME-LICENSE.txt", "https://raw.githubusercontent.com/microsoft/onnxruntime/main/LICENSE"],
];
await mkdir(join(outputRoot, "licenses"), { recursive: true });
for (const [name, url] of licenseSources) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`许可证获取失败：${name} HTTP ${response.status}`);
  const destination = join(outputRoot, "licenses", name);
  await writeFile(destination, await response.text(), "utf8");
  checksums.push(`${await sha256File(destination)}  licenses/${name}`);
}

await writeFile(join(outputRoot, "catalog.json"), `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  packages,
}, null, 2)}\n`, "utf8");
checksums.push(`${await sha256File(join(outputRoot, "catalog.json"))}  catalog.json`);
await copyFile(
  join(desktopRoot, "..", "docs", "runtime-dependencies-rustfs.md"),
  join(outputRoot, "CLOUD-HANDOFF.md"),
);
checksums.push(`${await sha256File(join(outputRoot, "CLOUD-HANDOFF.md"))}  CLOUD-HANDOFF.md`);
await writeFile(join(outputRoot, "SHA256SUMS"), `${checksums.join("\n")}\n`, "utf8");

const tar = process.platform === "win32"
  ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
const bundle = `${outputRoot}.tar`;
const archiveResult = spawnSync(tar, ["-cf", bundle, "-C", outputRoot,
  "catalog.json", "SHA256SUMS", "CLOUD-HANDOFF.md", "licenses", "objects"],
{ encoding: "utf8", timeout: 3_600_000, windowsHide: true });
if (archiveResult.error) throw archiveResult.error;
if (archiveResult.status !== 0) throw new Error(`发布包打包失败：${archiveResult.stderr}`);
const bundleHash = await sha256File(bundle);
await writeFile(`${bundle}.sha256`, `${bundleHash}  ${bundle.split(/[\\/]/u).at(-1)}\n`, "utf8");
console.log(`发布目录：${outputRoot}\n统一传输包：${bundle}\nSHA-256：${bundleHash}`);
