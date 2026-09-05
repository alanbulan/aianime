import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareMacosReleaseManifest } from "../scripts/prepare-macos-release-manifest.mjs";

const version = "1.1.63";
const require = createRequire(import.meta.url);
const updaterRequire = createRequire(require.resolve("electron-updater/package.json"));
const { dump, load } = updaterRequire("js-yaml");

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "macos-release-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = [];
  for (const extension of ["zip", "dmg"]) {
    const content = Buffer.from(`fixture ${extension}`);
    const url = `AI-anime-${version}-macos-x64.${extension}`;
    await writeFile(join(directory, url), content);
    files.push({ url, sha512: createHash("sha512").update(content).digest("base64"), size: content.length });
  }
  const update = { version, files, path: files[0].url, sha512: files[0].sha512, releaseDate: "2026-09-05T13:07:32.150Z" };
  const save = () => writeFile(join(directory, "latest-mac.yml"), dump(update));
  await save();
  return { directory, update, save };
}

test("macOS release JSON describes the ZIP updater and DMG installer using actual hashes", async (t) => {
  const { directory, update } = await fixture(t);
  const path = await prepareMacosReleaseManifest(directory, version);
  assert.equal(path, join(directory, "release-1.1.63-macos-x64.json"));
  const manifest = JSON.parse(await readFile(path, "utf8"));
  assert.equal(manifest.platform, "darwin");
  assert.equal(manifest.arch, "x64");
  assert.equal(manifest.version, version);
  assert.equal(manifest.releaseDate, update.releaseDate);
  assert.equal(manifest.updaterManifest, "latest-mac.yml");
  assert.equal(manifest.updaterManifestVerified, true);
  for (const [index, artifact] of [manifest, manifest.installer].entries()) {
    const bytes = await readFile(join(directory, update.files[index].url));
    assert.equal(artifact.file, update.files[index].url);
    assert.equal(artifact.size, bytes.length);
    assert.equal(artifact.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(artifact.sha512, createHash("sha512").update(bytes).digest("base64"));
  }
  assert.equal("authenticodeSigned" in manifest, false);
});

for (const [name, mutate, error] of [
  ["wrong version", (u) => { u.version = "1.1.62"; }, /version/],
  ["wrong ZIP hash", (u) => { u.files[0].sha512 = "wrong"; }, /SHA-512/],
  ["wrong DMG size", (u) => { u.files[1].size += 1; }, /size/],
  ["missing DMG entry", (u) => { u.files.pop(); }, /one updater entry/],
  ["wrong updater target", (u) => { u.path = u.files[1].url; }, /ZIP artifact/],
  ["wrong legacy hash", (u) => { u.sha512 = "wrong"; }, /SHA-512/],
]) {
  test(`macOS release manifest rejects ${name} before writing JSON`, async (t) => {
    const { directory, update, save } = await fixture(t);
    mutate(update);
    await save();
    await assert.rejects(prepareMacosReleaseManifest(directory, version), error);
    await assert.rejects(readFile(join(directory, `release-${version}-macos-x64.json`)), { code: "ENOENT" });
  });
}

test("macOS release manifest rejects a missing package", async (t) => {
  const { directory, update } = await fixture(t);
  await rm(join(directory, update.files[0].url));
  await assert.rejects(prepareMacosReleaseManifest(directory, version), { code: "ENOENT" });
});

test("Intel workflow uploads the verified release JSON with the existing Mac packages", async () => {
  const workflow = load(await readFile(new URL("../../.github/workflows/build-macos-intel.yml", import.meta.url), "utf8"));
  const steps = workflow.jobs.package.steps;
  const prepare = steps.find((step) => step.id === "artifacts");
  assert.ok(prepare.run.includes("pnpm --dir desktop release:manifest:mac:x64"));
  const upload = steps.find((step) => step.name === "Upload temporary workflow artifact");
  assert.ok(upload.with.path.includes("${{ steps.artifacts.outputs.manifest_path }}"));
  const draft = steps.find((step) => step.name === "Save tagged build to a draft release");
  assert.equal(draft.env.MANIFEST_PATH, "${{ steps.artifacts.outputs.manifest_path }}");
});
