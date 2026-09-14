import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { combineTargetReleases, releaseTargets, stageTargetRelease } from "../scripts/prepare-desktop-release.mjs";

const require = createRequire(import.meta.url);
const { load, dump } = createRequire(require.resolve("electron-updater/package.json"))("js-yaml");
const { publishClientRelease } = require("../scripts/publish-client-release.cjs");
const version = "1.2.3";
const notes = "三平台发布测试\n\n相同说明，保留空格。";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "desktop-release-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const combined = join(root, "combined");
  for (const [target, config] of Object.entries(releaseTargets)) {
    const directory = join(root, target);
    await mkdir(directory, { recursive: true });
    const windows = config.target === "windows";
    const files = [];
    for (const ext of windows ? ["exe"] : ["zip", "dmg"]) {
      const url = windows ? `AI-anime-${version}-x64-setup.exe` : `AI-anime-${version}-${target}.${ext}`;
      const bytes = Buffer.from(`${target} ${ext} fixture`);
      await writeFile(join(directory, url), bytes);
      files.push({ url, size: bytes.length, sha512: createHash("sha512").update(bytes).digest("base64") });
    }
    await writeFile(join(directory, config.updater), dump({
      version, files, path: files[0].url, sha512: files[0].sha512,
      releaseDate: "2026-09-14T05:00:00.000Z",
      ...(!windows ? { sparkleEdSignature: Buffer.alloc(64, 1).toString("base64") } : {}),
    }));
    const staged = await stageTargetRelease(directory, version, target, notes);
    await cp(staged, join(combined, `AI-anime-${target}`), { recursive: true });
  }
  return { root, combined };
}

test("three native handoffs combine into one cloud release without colliding Mac update files", async (t) => {
  const { combined } = await fixture(t);
  const path = await combineTargetReleases(combined, version, notes);
  const plan = JSON.parse(await readFile(path, "utf8"));
  assert.equal(plan.version, version);
  assert.equal(plan.notes, notes);
  assert.deepEqual(plan.artifacts.map(({ target, arch }) => `${target}/${arch}`), [
    "windows/x86_64", "macos/x86_64", "macos/arm64",
  ]);
  for (const artifact of plan.artifacts) {
    const yaml = load(await readFile(join(combined, artifact.manifest), "utf8"));
    assert.equal(yaml.files.length, 1);
    assert.equal(yaml.files[0].url, basename(artifact.installer));
    assert.equal(yaml.files[0].size, (await readFile(join(combined, artifact.installer))).length);
    if (artifact.target === "macos") assert.match(yaml.sparkleEdSignature, /^[A-Za-z0-9+/]{86}==$/);
  }
  const githubAssets = (await readFile(join(combined, "github-assets.txt"), "utf8")).trim().split("\n");
  const names = githubAssets.map((file) => basename(file));
  assert.equal(names.length, 14);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes("latest-mac-x64.yml"));
  assert.ok(names.includes("latest-mac-arm64.yml"));
  assert.ok(names.includes(`AI-anime-${version}-x64-setup.exe`));
  for (const file of githubAssets) assert.ok((await readFile(file)).length > 0);
  // The production publisher validates the complete plan without credentials or network writes.
  await publishClientRelease({ plan: path, "dry-run": true }, {});
});

test("Apple Silicon manifest and cloud plan retain arm64 architecture", async (t) => {
  const { root } = await fixture(t);
  const directory = join(root, "macos-arm64");
  const manifest = JSON.parse(await readFile(join(directory, `release-${version}-macos-arm64.json`), "utf8"));
  assert.equal(manifest.arch, "arm64");
  assert.equal(manifest.file, `AI-anime-${version}-macos-arm64.zip`);
  const plan = JSON.parse(await readFile(join(directory, "cloud/release.json"), "utf8"));
  assert.equal(plan.artifacts[0].arch, "arm64");
});

for (const [name, mutate, error] of [
  ["a missing platform", (dir) => rm(join(dir, "AI-anime-macos-arm64"), { recursive: true }), /ENOENT/],
  ["a modified installer", (dir) => writeFile(join(dir, `AI-anime-windows-x64/AI-anime-${version}-x64-setup.exe`), "tampered"), /checksum mismatch/],
  ["a modified cloud YAML", (dir) => writeFile(join(dir, "AI-anime-macos-arm64/cloud/latest-mac.yml"), "tampered"), /checksum mismatch/],
  ["a modified checksum list", (dir) => writeFile(join(dir, "AI-anime-macos-x64/SHA256SUMS-macos-x64.txt"), "tampered"), /Checksum list mismatch/],
]) {
  test(`release assembly rejects ${name} before writing a publish plan`, async (t) => {
    const { combined } = await fixture(t);
    await mutate(combined);
    await assert.rejects(combineTargetReleases(combined, version, notes), error);
    await assert.rejects(readFile(join(combined, "cloud-release.json")), { code: "ENOENT" });
  });
}

test("release assembly rejects mixed notes or versions", async (t) => {
  const { combined } = await fixture(t);
  await assert.rejects(combineTargetReleases(combined, version, "另一个版本说明"), /notes mismatch/);
  const path = join(combined, `AI-anime-windows-x64/release-${version}-windows-x64.json`);
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.version = "1.2.2";
  await writeFile(path, JSON.stringify(manifest));
  await assert.rejects(combineTargetReleases(combined, version, notes), /version mismatch/);
});

test("existing Windows CRLF handoff combines without rewriting any signed or checksummed file", async (t) => {
  const { combined } = await fixture(t);
  const root = join(combined, "AI-anime-windows-x64");
  const manifestName = `release-${version}-windows-x64.json`;
  const manifestPath = join(root, manifestName);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.notes = notes.replace(/\n/g, "\r\n");
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(manifestPath, bytes);
  const checksumPath = join(root, "SHA256SUMS-windows-x64.txt");
  const checksum = (await readFile(checksumPath, "utf8")).replace(
    new RegExp(`[a-f0-9]{64}  ${manifestName.replaceAll(".", "\\.")}\\n`),
    `${createHash("sha256").update(bytes).digest("hex")}  ${manifestName}\n`,
  );
  await writeFile(checksumPath, checksum);
  const planPath = await combineTargetReleases(combined, version, notes);
  assert.equal(JSON.parse(await readFile(planPath, "utf8")).notes, notes);
  assert.deepEqual(await readFile(manifestPath), bytes);
  assert.equal(await readFile(checksumPath, "utf8"), checksum);
  // Whitespace other than CRLF, and invalid original checksum bytes, remain errors.
  await assert.rejects(combineTargetReleases(combined, version, notes.replace("保留", " 保留")), /notes mismatch/);
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, notes })}\n`);
  await assert.rejects(combineTargetReleases(combined, version, notes), /Checksum list mismatch/);
});

test("new Windows handoffs normalize release note line endings before checksumming", async (t) => {
  const { root } = await fixture(t);
  const staged = await stageTargetRelease(join(root, "windows-x64"), version, "windows-x64", notes.replace(/\n/g, "\r\n"));
  const manifest = JSON.parse(await readFile(join(staged, `release-${version}-windows-x64.json`), "utf8"));
  assert.equal(manifest.notes, notes);
});

test("native staging rejects wrong architecture and missing Sparkle signatures", async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(stageTargetRelease(root, version, "linux-x64"), /Unsupported release target/);
  const directory = join(root, "macos-arm64");
  const path = join(directory, "latest-mac.yml");
  const update = load(await readFile(path, "utf8"));
  delete update.sparkleEdSignature;
  await writeFile(path, dump(update));
  await assert.rejects(stageTargetRelease(directory, version, "macos-arm64"), /signature/);
});

test("workflow builds exactly three native targets and waits for all before a single release", async () => {
  const workflow = load(await readFile(new URL("../../.github/workflows/build-desktop.yml", import.meta.url), "utf8"));
  const matrix = workflow.jobs.package.strategy.matrix.include;
  assert.deepEqual(matrix.map(({ target, runner, platform, arch, package_script }) => [target, runner, platform, arch, package_script]), [
    ["windows-x64", "windows-2025", "win32", "x64", "package:win"],
    ["macos-x64", "macos-15-intel", "darwin", "x64", "package:mac:x64"],
    ["macos-arm64", "macos-15", "darwin", "arm64", "package:mac"],
  ]);
  assert.equal(matrix[1].deployment_target, "13.0");
  assert.equal(workflow.jobs.package["runs-on"], "${{ matrix.runner }}");
  assert.equal(workflow.jobs.package.strategy["fail-fast"], false);
  assert.equal(workflow.jobs.release.needs, "package");
  assert.equal(workflow.jobs.release.if, undefined);
  assert.equal(workflow.permissions.contents, "read");
  assert.equal(workflow.jobs.release.permissions.contents, "write");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(workflow.concurrency.group, "build-desktop-${{ github.repository }}");

  const steps = workflow.jobs.package.steps;
  const at = (name) => steps.findIndex((step) => step.name === name);
  const browser = at("Install Chromium for desktop security tests");
  const tests = at("Test desktop packaging contracts");
  const build = at("Build and verify native package");
  const sign = at("Sign update archive with Sparkle Ed25519");
  const stage = at("Stage verified package and checksums");
  const upload = at("Upload platform artifact");
  assert.ok(at("Install locked Node dependencies") < browser && browser < tests && tests < build);
  assert.ok(at("Verify native Sparkle update and signature rejection") < build);
  const restoreFfmpeg = at("Restore native FFmpeg binaries");
  const validateFfmpeg = at("Build and validate native FFmpeg");
  const saveFfmpeg = at("Save validated native FFmpeg binaries");
  assert.ok(tests < restoreFfmpeg && restoreFfmpeg < validateFfmpeg && validateFfmpeg < saveFfmpeg && saveFfmpeg < build);
  assert.match(steps[restoreFfmpeg].with.key, /matrix\.runner.*matrix\.arch.*matrix\.deployment_target.*hashFiles/);
  assert.equal(steps[restoreFfmpeg].with["restore-keys"], undefined);
  assert.equal(steps[restoreFfmpeg].with.path, steps[saveFfmpeg].with.path);
  assert.equal(steps[validateFfmpeg].run, "pnpm --dir desktop runtime:ffmpeg");
  assert.match(steps[saveFfmpeg].if, /cache-hit != 'true'/);
  assert.equal(steps[saveFfmpeg].with.key, "${{ steps.ffmpeg-cache.outputs.cache-primary-key }}");
  assert.ok(build < sign && sign < stage && stage < upload);
  assert.equal(steps[sign].if, "runner.os == 'macOS'");
  assert.equal(steps[sign].env.SPARKLE_ED_PRIVATE_KEY, "${{ secrets.SPARKLE_ED_PRIVATE_KEY }}");
  assert.ok(steps.filter((_, index) => index !== sign).every((step) => !step.env?.SPARKLE_ED_PRIVATE_KEY));
  assert.ok(steps.every((step) => !step.env?.RELEASE_PASSWORD));
  assert.equal(steps[upload].with.path, "desktop/release/handoff/");
  assert.equal(steps[upload].with.name, "AI-anime-${{ matrix.target }}");

  const release = workflow.jobs.release.steps;
  const download = release.find((step) => step.uses?.startsWith("actions/download-artifact@"));
  assert.equal(download.with["merge-multiple"], false);
  const combine = release.findIndex((step) => step.run === "pnpm --dir desktop release:combine");
  const draft = release.findIndex((step) => step.name === "Save tagged builds to one draft release");
  const publish = release.findIndex((step) => step.name === "Publish verified packages to cloud");
  assert.ok(combine >= 0 && combine < draft && draft < publish);
  assert.equal(release[draft].if, "github.ref_type == 'tag'");
  assert.match(release[draft].run, /--draft/);
  assert.match(release[draft].run, /refusing to replace/);
  assert.match(release[publish].if, /github\.repository == 'alanbulan\/aianime'/);
  assert.match(release[publish].if, /refs\/heads\/master/);
  assert.equal(release[publish].env.RELEASE_PASSWORD, "${{ secrets.RELEASE_PASSWORD }}");
  assert.match(release[publish].run, /pnpm --dir desktop release:publish --reason/);
  assert.ok(release.filter((_, index) => index !== publish).every((step) => !step.env?.RELEASE_PASSWORD));
  const desktop = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(desktop.scripts["package:mac"], /smoke-packaged-mac-resources\.sh arm64 15\.0\.0/);
});
