import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(process.platform, "darwin", "Sparkle must be built on macOS");
const root = fileURLToPath(new URL("../runtime/sparkle/", import.meta.url));
mkdirSync(root, { recursive: true });
const version = "2.9.6";
function download(url, name, digest) {
  const path = join(root, name);
  if (!existsSync(path)) execFileSync("curl", ["--fail", "--location", "--silent", "--show-error", url, "--output", path]);
  assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), digest, `Sparkle integrity failure: ${name}`);
  return path;
}
const archive = download(`https://github.com/sparkle-project/Sparkle/releases/download/${version}/Sparkle-${version}.tar.xz`,
  "Sparkle.tar.xz", "52bf9e88cdd972fc0c81501377a880e90d47031bd8ca5462488f843e2609e192");
execFileSync("tar", ["-xf", archive, "-C", root]);
const sources = {
  "main.m": "6df90a46bc481a76261f1b5c1a3123572f316fa3dc4463ab4269e2f5ecd0051e",
  "SPUCommandLineDriver.m": "0924b26df77f726afafed2bb149998c4c27813574c0a9e67ddf69cc0419490b1",
  "SPUCommandLineDriver.h": "3f7d8efdd5b1be0e150ecb75795e70b0cd4fadbd1b18818b2dcf7c26f0dd6171",
  "SPUCommandLineUserDriver.m": "7e23c34763c74afbdbb7095cdd02d23343e9d0836e358e9da1099ff198e51600",
  "SPUCommandLineUserDriver.h": "525cc91b76b7c88d3f0bc476cfdf0df72c50739c31d3ff71e9da9a6bb4773c42",
};
for (const [name, hash] of Object.entries(sources)) {
  download(`https://raw.githubusercontent.com/sparkle-project/Sparkle/${version}/sparkle-cli/${name}`, name, hash);
}
execFileSync("clang", ["-fobjc-arc", "-mmacosx-version-min=13.0", "-F", root,
  // Match Sparkle's ConfigCommon.xcconfig definitions for the official CLI.
  "-DSPU_OBJC_DIRECT=__attribute__((objc_direct))",
  "-DSPU_OBJC_DIRECT_MEMBERS=__attribute__((objc_direct_members))",
  "-framework", "Sparkle", "-framework", "Cocoa", "-Wl,-rpath,@executable_path/../Frameworks",
  ...Object.keys(sources).filter((name) => name.endsWith(".m")).map((name) => join(root, name)),
  "-o", join(root, "sparkle")], { stdio: "inherit" });
console.log(`Verified and built official Sparkle ${version} (${process.arch})`);
