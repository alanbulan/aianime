import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Reuse the updater's locked YAML parser and its manifest format.
const require = createRequire(import.meta.url);
const updaterRequire = createRequire(require.resolve("electron-updater/package.json"));
const { load } = updaterRequire("js-yaml");

async function describeArtifact(directory, file) {
  const sha256 = createHash("sha256");
  const sha512 = createHash("sha512");
  let size = 0;
  for await (const chunk of createReadStream(join(directory, file))) {
    size += chunk.length;
    sha256.update(chunk);
    sha512.update(chunk);
  }
  assert.ok(size > 0, `Empty artifact: ${file}`);
  return { file, size, sha256: sha256.digest("hex"), sha512: sha512.digest("base64") };
}

export async function prepareMacosReleaseManifest(directory, version) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
  const updaterManifest = "latest-mac.yml";
  const update = load(await readFile(join(directory, updaterManifest), "utf8"));
  assert.equal(update.version, version, "Updater version does not match the application");
  assert.ok(Array.isArray(update.files), "Updater files are missing");
  assert.ok(typeof update.releaseDate === "string" && Number.isFinite(Date.parse(update.releaseDate)),
    "Updater release date is missing or invalid");
  const zip = await describeArtifact(directory, `AI-anime-${version}-macos-x64.zip`);
  const installer = await describeArtifact(directory, `AI-anime-${version}-macos-x64.dmg`);
  for (const artifact of [zip, installer]) {
    const entries = update.files.filter((entry) => entry.url === artifact.file);
    assert.equal(entries.length, 1, `Expected one updater entry for ${artifact.file}`);
    assert.equal(entries[0].sha512, artifact.sha512, `Updater SHA-512 mismatch: ${artifact.file}`);
    if (entries[0].size !== undefined) {
      assert.equal(entries[0].size, artifact.size, `Updater size mismatch: ${artifact.file}`);
    }
  }
  assert.equal(update.path, zip.file, "macOS updater must use the ZIP artifact");
  assert.equal(update.sha512, zip.sha512, "Legacy updater SHA-512 mismatch");
  const manifest = {
    version,
    platform: "darwin",
    arch: "x64",
    ...zip,
    releaseDate: update.releaseDate,
    updaterManifest,
    updaterManifestVerified: true,
    installer,
  };
  const path = join(directory, `release-${version}-macos-x64.json`);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return path;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
  const { version } = JSON.parse(await readFile(join(desktopRoot, "package.json"), "utf8"));
  console.log(await prepareMacosReleaseManifest(join(desktopRoot, "release"), version));
}
