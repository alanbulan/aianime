import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { installSparkleUpdate } from "../src/commercial-sparkle-installer.ts";

assert.equal(process.platform, "darwin");
const runtime = fileURLToPath(new URL("../runtime/sparkle/", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "ai-anime-sparkle-smoke-"));
const marker = join(directory, "launched-version");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32).toString("base64");
const publicEdKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
const bundleId = `com.ai-anime.sparkle-smoke.${process.pid}`;
const source = join(directory, "Smoke.m");
await writeFile(source, `#import <Cocoa/Cocoa.h>
@interface SmokeDelegate : NSObject <NSApplicationDelegate>
@end
@implementation SmokeDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  NSDictionary *info = [[NSBundle mainBundle] infoDictionary];
  [info[@"CFBundleVersion"] writeToFile:info[@"SmokeMarkerPath"] atomically:YES encoding:NSUTF8StringEncoding error:nil];
}
@end
int main() { @autoreleasepool { NSApplication *app = [NSApplication sharedApplication]; SmokeDelegate *delegate = [SmokeDelegate new]; app.delegate = delegate; [app run]; } return 0; }
`);
async function bundle(name, version, identifier) {
  const path = join(directory, name, "Smoke.app");
  const contents = join(path, "Contents");
  await mkdir(join(contents, "MacOS"), { recursive: true });
  await mkdir(join(contents, "Frameworks"), { recursive: true });
  await writeFile(join(contents, "Info.plist"), `<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${identifier}</string><key>CFBundleExecutable</key><string>Smoke</string><key>CFBundleName</key><string>Smoke</string><key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>${version}</string><key>CFBundleShortVersionString</key><string>${version}</string>
<key>SUPublicEDKey</key><string>${publicEdKey}</string><key>SUVerifyUpdateBeforeExtraction</key><true/><key>SUEnableAutomaticChecks</key><false/>
<key>SmokeMarkerPath</key><string>${marker}</string></dict></plist>`);
  execFileSync("clang", ["-fobjc-arc", "-mmacosx-version-min=13.0", "-framework", "Cocoa", source, "-o", join(contents, "MacOS/Smoke")]);
  await cp(join(runtime, "Sparkle.framework"), join(contents, "Frameworks/Sparkle.framework"), { recursive: true, verbatimSymlinks: true });
  await cp(join(runtime, "Sparkle.app"), join(contents, "Helpers/Sparkle.app"), { recursive: true });
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", path], { stdio: "pipe" });
  return path;
}
async function waitVersion(version) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await readFile(marker, "utf8").catch(() => "") === version) return;
    await delay(500);
  }
  throw new Error(`Native relaunch did not reach ${version}`);
}
// A bounded native test, not an installation timeout in the product.
const watchdog = setTimeout(() => { console.error("Native Sparkle smoke timed out"); process.exit(1); }, 180_000);
try {
  // Sparkle's failed installer service exits asynchronously. Independent bundle
  // identities keep signature rejection from contaminating the successful case.
  for (const scenario of ["invalid", "valid"]) {
    const identifier = `${bundleId}.${scenario}`;
    const oldBundle = await bundle(`${scenario}-installed`, "1.0.0", identifier);
    const newBundle = await bundle(`${scenario}-update`, "1.0.1", identifier);
    const zip = join(directory, `${scenario}.zip`);
    execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", newBundle, zip]);
    const signed = execFileSync(join(runtime, "bin/sign_update"), ["--ed-key-file", "-", zip], { input: `${seed}\n`, encoding: "utf8" });
    const signature = signed.match(/sparkle:edSignature="([A-Za-z0-9+/]{86}==)"/)?.[1];
    assert.ok(signature, "Official signing utility must accept the generated Ed25519 seed");
    await rm(marker, { force: true });
    execFileSync("open", ["-n", oldBundle]);
    await waitVersion("1.0.0");
    try {
      if (scenario === "invalid") {
        await assert.rejects(installSparkleUpdate(oldBundle, { version: "1.0.1", archivePath: zip, edSignature: Buffer.alloc(64, 1).toString("base64") }), (error) => {
          assert.match(error.message, /improperly signed|signature|error 3001/i,
            "An unrelated installer error must not count as signature rejection");
          console.log(`Native rejection: ${error.message.trim()}`);
          return true;
        });
        assert.equal(await readFile(marker, "utf8"), "1.0.0");
        assert.match(await readFile(join(oldBundle, "Contents/Info.plist"), "utf8"), /1\.0\.0/);
        console.log("PASS: invalid Ed25519 signature rejected, installed app unchanged");
      } else {
        await installSparkleUpdate(oldBundle, { version: "1.0.1", archivePath: zip, edSignature: signature });
        await waitVersion("1.0.1");
        assert.match(await readFile(join(oldBundle, "Contents/Info.plist"), "utf8"), /1\.0\.1/);
        console.log("PASS: official Sparkle validated, replaced and relaunched an ad-hoc signed app");
      }
    } finally {
      try { execFileSync("osascript", ["-e", `tell application id "${identifier}" to quit`]); } catch {}
    }
  }
} finally {
  clearTimeout(watchdog);
  // Only the unique directory created above belongs to this disposable fixture.
  await rm(directory, { recursive: true, force: true });
}
