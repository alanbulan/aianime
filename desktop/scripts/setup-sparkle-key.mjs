import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

// One-time release administrator setup. Never prints or writes a plaintext key.
assert.equal(process.platform, "win32");
assert.ok(process.env.LOCALAPPDATA);
const backup = join(process.env.LOCALAPPDATA, "AI-anime-release-keys", "sparkle-ed25519.dpapi");
assert.ok(!existsSync(backup), "Existing key backup found; do not rotate the installed trust root accidentally");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32).toString("base64");
execFileSync("pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command",
  "$keyPath = Join-Path $env:LOCALAPPDATA 'AI-anime-release-keys/sparkle-ed25519.dpapi'; New-Item -ItemType Directory -Force -Path (Split-Path $keyPath) | Out-Null; $keyText = [Console]::In.ReadToEnd().Trim(); $keyText | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $keyPath"], { input: seed, stdio: ["pipe", "ignore", "pipe"] });
execFileSync("gh", ["secret", "set", "SPARKLE_ED_PRIVATE_KEY", "--repo", "alanbulan/aianime"], {
  input: seed, stdio: ["pipe", "ignore", "pipe"],
});
console.log(JSON.stringify({ publicKey: publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64"), encryptedBackup: backup }));
