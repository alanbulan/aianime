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
const { load, dump } = updaterRequire("js-yaml");

export async function prepareWindowsUpdateManifest(directory, version) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
  const path = join(directory, "latest.yml");
  const update = load(await readFile(path, "utf8"));
  const file = `AI-anime-${version}-x64-setup.exe`;
  assert.equal(update.version, version, "Updater version does not match the application");
  assert.ok(Array.isArray(update.files), "Updater files are missing");
  assert.equal(update.files.length, 1, "Expected one Windows x64 updater entry");
  assert.equal(update.files[0].url, file, "Updater entry does not match the Windows installer");
  assert.equal(update.path, file, "Updater path does not match the Windows installer");

  const hash = createHash("sha512");
  let size = 0;
  for await (const chunk of createReadStream(join(directory, file))) {
    size += chunk.length;
    hash.update(chunk);
  }
  assert.ok(size > 0, `Empty artifact: ${file}`);
  const sha512 = hash.digest("base64");
  assert.equal(update.files[0].sha512, sha512, "Updater SHA-512 mismatch");
  assert.equal(update.sha512, sha512, "Legacy updater SHA-512 mismatch");

  // NSIS without differentialPackage omits size in electron-builder's update info.
  update.files[0].size = size;
  await writeFile(path, dump(update, { lineWidth: -1 }));
  return path;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
  const { version } = JSON.parse(await readFile(join(desktopRoot, "package.json"), "utf8"));
  console.log(await prepareWindowsUpdateManifest(join(desktopRoot, "release"), version));
}
