import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareWindowsUpdateManifest } from "../scripts/prepare-windows-update-manifest.mjs";

const version = "1.1.63";
const require = createRequire(import.meta.url);
const updaterRequire = createRequire(require.resolve("electron-updater/package.json"));
const { dump, load } = updaterRequire("js-yaml");

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "windows-update-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const content = Buffer.from("Windows installer fixture");
  const url = `AI-anime-${version}-x64-setup.exe`;
  const sha512 = createHash("sha512").update(content).digest("base64");
  await writeFile(join(directory, url), content);
  const update = {
    version, files: [{ url, sha512 }], path: url, sha512,
    releaseDate: "2026-09-05T13:07:32.150Z", releaseNotes: "保留发布说明",
  };
  const path = join(directory, "latest.yml");
  const save = () => writeFile(path, dump(update));
  await save();
  return { directory, path, update, content, save };
}

for (const initialSize of [undefined, 1, 25]) {
  test(`Windows updater writes actual size for initial size ${initialSize}`, async (t) => {
    const { directory, path, update, content, save } = await fixture(t);
    if (initialSize !== undefined) update.files[0].size = initialSize;
    await save();
    assert.equal(await prepareWindowsUpdateManifest(directory, version), path);
    const result = load(await readFile(path, "utf8"));
    update.files[0].size = content.length;
    assert.deepEqual(result, update);
    const first = await readFile(path, "utf8");
    await prepareWindowsUpdateManifest(directory, version);
    assert.equal(await readFile(path, "utf8"), first);
  });
}

for (const [name, mutate, error] of [
  ["wrong version", (u) => { u.version = "1.1.62"; }, /version/],
  ["wrong hash", (u) => { u.files[0].sha512 = "wrong"; }, /SHA-512/],
  ["wrong legacy hash", (u) => { u.sha512 = "wrong"; }, /SHA-512/],
  ["wrong installer", (u) => { u.files[0].url = "old.exe"; }, /installer/],
  ["wrong updater path", (u) => { u.path = "old.exe"; }, /path/],
  ["missing entry", (u) => { u.files = []; }, /one Windows/],
]) {
  test(`Windows updater rejects ${name} without overwriting the manifest`, async (t) => {
    const { directory, path, update, save } = await fixture(t);
    mutate(update);
    await save();
    const before = await readFile(path, "utf8");
    await assert.rejects(prepareWindowsUpdateManifest(directory, version), error);
    assert.equal(await readFile(path, "utf8"), before);
  });
}

test("Windows updater rejects a missing installer without overwriting the manifest", async (t) => {
  const { directory, path, update } = await fixture(t);
  await rm(join(directory, update.path));
  const before = await readFile(path, "utf8");
  await assert.rejects(prepareWindowsUpdateManifest(directory, version), { code: "ENOENT" });
  assert.equal(await readFile(path, "utf8"), before);
});

test("Windows packaging finalizes update size after builder and before resource checks", async () => {
  const { scripts } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(scripts["release:manifest:win"], "node scripts/prepare-windows-update-manifest.mjs");
  assert.match(scripts["package:win"], /electron-builder --win nsis --x64 --publish never && pnpm run release:manifest:win && node scripts\/smoke-packaged-win-resources.mjs/);
});
