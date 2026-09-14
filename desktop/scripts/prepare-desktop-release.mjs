import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readWorkspaceVersion } from "../../scripts/release/bump-version.mjs";
import { prepareMacosReleaseManifest } from "./prepare-macos-release-manifest.mjs";
import { prepareWindowsUpdateManifest } from "./prepare-windows-update-manifest.mjs";

const require = createRequire(import.meta.url);
const { load } = createRequire(require.resolve("electron-updater/package.json"))("js-yaml");
export const releaseTargets = {
  "windows-x64": { target: "windows", arch: "x86_64", nodeArch: "x64", updater: "latest.yml" },
  "macos-x64": { target: "macos", arch: "x86_64", nodeArch: "x64", updater: "latest-mac.yml" },
  "macos-arm64": { target: "macos", arch: "arm64", nodeArch: "arm64", updater: "latest-mac.yml" },
};

function targetFiles(version, target) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
  assert.ok(Object.hasOwn(releaseTargets, target), "Unsupported release target");
  const config = releaseTargets[target];
  const windows = config.target === "windows";
  const installer = windows ? `AI-anime-${version}-x64-setup.exe` : `AI-anime-${version}-${target}.zip`;
  const binaries = windows ? [installer] : [installer, `AI-anime-${version}-${target}.dmg`];
  const updater = windows ? config.updater : `latest-mac-${config.nodeArch}.yml`;
  return { config, installer, binaries, updater,
    files: [...binaries, updater, `cloud/${config.updater}`],
    manifest: `release-${version}-${target}.json`, checksum: `SHA256SUMS-${target}.txt` };
}

async function describeFile(directory, file) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(join(directory, file))) {
    size += chunk.length;
    hash.update(chunk);
  }
  assert.ok(size > 0 && size < 2 ** 31, `Release asset must be non-empty and smaller than 2 GiB: ${file}`);
  return { file, size, sha256: hash.digest("hex") };
}

function checksumText(files) {
  return files.map(({ file, sha256 }) => `${sha256}  ${file}\n`).join("");
}

export async function stageTargetRelease(directory, version, target, notes = "") {
  const spec = targetFiles(version, target);
  if (spec.config.target === "macos") {
    await prepareMacosReleaseManifest(directory, version, notes, spec.config.nodeArch);
  } else {
    await prepareWindowsUpdateManifest(directory, version);
  }
  const handoff = join(directory, "handoff");
  await mkdir(join(handoff, "cloud"), { recursive: true });
  for (const file of spec.files) {
    const source = file === spec.updater ? spec.config.updater
      : file.startsWith("cloud/") && spec.config.target === "windows" ? spec.config.updater : file;
    await copyFile(join(directory, source), join(handoff, file), constants.COPYFILE_FICLONE);
  }
  const files = await Promise.all(spec.files.map((file) => describeFile(handoff, file)));
  await writeFile(join(handoff, spec.manifest), `${JSON.stringify({ version, target, notes, files }, null, 2)}\n`);
  await writeFile(join(handoff, spec.checksum), checksumText([
    ...files, await describeFile(handoff, spec.manifest),
  ]));
  return handoff;
}

export async function combineTargetReleases(directory, version, notes = "") {
  const artifacts = [];
  const githubAssets = [];
  // All three jobs must finish and every byte must verify before a publish plan is written.
  for (const target of Object.keys(releaseTargets)) {
    const spec = targetFiles(version, target);
    const subdirectory = `AI-anime-${target}`;
    const root = join(directory, subdirectory);
    const manifest = JSON.parse(await readFile(join(root, spec.manifest), "utf8"));
    assert.equal(manifest.version, version, `Release version mismatch: ${target}`);
    assert.equal(manifest.target, target, `Release target mismatch: ${target}`);
    assert.equal(manifest.notes, notes, `Release notes mismatch: ${target}`);
    assert.deepEqual(manifest.files.map((file) => file.file), spec.files, `Release files mismatch: ${target}`);
    const actual = await Promise.all(spec.files.map((file) => describeFile(root, file)));
    assert.deepEqual(manifest.files, actual, `Release checksum mismatch: ${target}`);
    assert.equal(await readFile(join(root, spec.checksum), "utf8"), checksumText([
      ...actual, await describeFile(root, spec.manifest),
    ]), `Checksum list mismatch: ${target}`);
    artifacts.push({ target: spec.config.target, arch: spec.config.arch,
      installer: `${subdirectory}/${spec.installer}`, manifest: `${subdirectory}/cloud/${spec.config.updater}` });
    githubAssets.push(...[...spec.binaries, spec.updater, spec.manifest, spec.checksum]
      .map((file) => resolve(root, file)));
  }
  const plan = join(directory, "cloud-release.json");
  await writeFile(plan, `${JSON.stringify({ version, notes, artifacts }, null, 2)}\n`);
  await writeFile(join(directory, "github-assets.txt"), `${githubAssets.join("\n")}\n`);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
  const version = readWorkspaceVersion(join(desktopRoot, ".."));
  const releaseNotes = await readFile(join(desktopRoot, "../src/ai_anime/release-notes.md"), "utf8");
  const frontmatter = releaseNotes.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(frontmatter, "Release notes metadata is missing");
  assert.equal(load(frontmatter[1]).version, version, "Release notes version mismatch");
  if (process.env.GITHUB_REF_TYPE === "tag") {
    assert.equal(process.env.GITHUB_REF_NAME, `v${version}`, "Release tag version mismatch");
  }
  const notes = releaseNotes.slice(frontmatter[0].length).trim();
  const directory = join(desktopRoot, "release");
  const mode = process.argv[2];
  assert.ok(["stage", "combine", "verify"].includes(mode), "Expected stage, combine or verify");
  if (mode === "stage") console.log(await stageTargetRelease(directory, version, process.argv[3], notes));
  if (mode === "combine") console.log(await combineTargetReleases(directory, version, notes));
  if (mode === "verify") console.log(`Workspace release version verified: ${version}`);
}
