import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(process.platform, "darwin");
const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const secret = process.env.SPARKLE_ED_PRIVATE_KEY;
assert.ok(secret && /^[A-Za-z0-9+/]{43}=$/.test(secret), "Missing Sparkle signing secret");
const require = createRequire(import.meta.url);
const updaterRequire = createRequire(require.resolve("electron-updater/package.json"));
const { load, dump } = updaterRequire("js-yaml");
const config = load(await readFile(join(root, "electron-builder.yml"), "utf8"));
const signingKey = createPrivateKey({ key: Buffer.concat([
  Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(secret, "base64"),
]), format: "der", type: "pkcs8" });
assert.equal(createPublicKey(signingKey).export({ format: "der", type: "spki" }).subarray(-32).toString("base64"),
  config.mac.extendInfo.SUPublicEDKey, "Signing secret does not match the installed public trust root");
const childEnv = { ...process.env };
delete childEnv.SPARKLE_ED_PRIVATE_KEY;
const archive = join(root, "release", `AI-anime-${version}-macos-${process.arch}.zip`);
const signed = execFileSync(join(root, "runtime/sparkle/bin/sign_update"), ["--ed-key-file", "-", archive], {
  input: `${secret}\n`, encoding: "utf8", env: childEnv, stdio: ["pipe", "pipe", "pipe"],
});
const signature = signed.match(/sparkle:edSignature="([A-Za-z0-9+/]{86}==)"/);
assert.ok(signature, "Sparkle did not return an Ed25519 signature");
const manifestPath = join(root, "release/latest-mac.yml");
const manifest = load(await readFile(manifestPath, "utf8"));
assert.equal(manifest.version, version);
manifest.sparkleEdSignature = signature[1];
await writeFile(manifestPath, dump(manifest));
console.log(`Signed macOS ${process.arch} update ${version}`);
