// Copyright (c) 2026 AI anime

import {
  createHash,
  createPrivateKey,
  sign,
} from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const [artifactInput, target, arch, installerKind, outputInput] = args;
const privateKeyInput =
  process.env.AI_ANIME_ARTIFACT_SIGNING_PRIVATE_KEY_FILE?.trim();
const signatureKeyId =
  process.env.AI_ANIME_ARTIFACT_SIGNATURE_KEY_ID?.trim();

if (!artifactInput || !target || !arch || !installerKind) {
  throw new Error(
    "Usage: create-release-metadata <artifact> <target> <arch> <installer-kind> [output]",
  );
}
if (!privateKeyInput || !signatureKeyId) {
  throw new Error(
    "AI_ANIME_ARTIFACT_SIGNING_PRIVATE_KEY_FILE and AI_ANIME_ARTIFACT_SIGNATURE_KEY_ID are required",
  );
}
if (
  (target === "windows" && (arch !== "x86_64" || installerKind !== "nsis")) ||
  (target === "macos" && (arch !== "arm64" || installerKind !== "dmg"))
) {
  throw new Error(`Unsupported release tuple: ${target}/${arch}/${installerKind}`);
}

const artifactPath = resolve(artifactInput);
const outputPath = resolve(outputInput ?? `${artifactPath}.release.json`);
const privateKeyPath = resolve(privateKeyInput);
const artifactStat = await stat(artifactPath);
if (!artifactStat.isFile() || artifactStat.size <= 0) {
  throw new Error("Release artifact must be a non-empty file");
}

const platformSignature = assertPlatformSignature(artifactPath, target);
const privateKey = createPrivateKey(await readFile(privateKeyPath, "utf8"));
if (privateKey.asymmetricKeyType !== "ed25519") {
  throw new Error("Artifact signing key must be an Ed25519 PKCS#8 private key");
}

const bytes = await readFile(artifactPath);
const metadata = {
  target,
  arch,
  installerKind,
  fileName: basename(artifactPath),
  contentType: contentTypeFor(artifactPath),
  sizeBytes: bytes.byteLength,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  signatureKeyId,
  signature: sign(null, bytes, privateKey).toString("base64"),
  ...(platformSignature ? { platformSignature } : {}),
};

await writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
});
process.stdout.write(`${outputPath}\n`);

function assertPlatformSignature(filePath, artifactTarget) {
  if (artifactTarget === "windows") {
    if (process.platform !== "win32") {
      throw new Error("Windows release metadata must be generated on Windows");
    }
    const escapedPath = filePath.replace(/'/g, "''");
    const command =
      "Import-Module (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; Get-AuthenticodeSignature -LiteralPath '" +
      escapedPath +
      "' | Select-Object -Property @{Name='Status';Expression={$_.Status.ToString()}},@{Name='Publisher';Expression={$_.SignerCertificate.Subject}} | ConvertTo-Json -Compress";
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { encoding: "utf8", windowsHide: true },
    );
    if (result.status !== 0) {
      throw new Error(
        result.stderr.trim() || "Unable to verify Windows Authenticode signature",
      );
    }
    const record = JSON.parse(result.stdout.trim());
    if (String(record.Status).toUpperCase() !== "VALID") {
      throw new Error(`Windows Authenticode status is ${record.Status}`);
    }
    return String(record.Publisher ?? "").trim();
  }

  if (artifactTarget === "macos") {
    if (process.platform !== "darwin") {
      throw new Error("macOS release metadata must be generated on macOS");
    }
    assertCommand("/usr/bin/codesign", ["--verify", "--deep", "--strict", filePath]);
    assertCommand("/usr/sbin/spctl", ["--assess", "--type", "open", filePath]);
    return "Developer ID + notarization";
  }

  throw new Error(`Unsupported release target: ${artifactTarget}`);
}

function assertCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${command} verification failed`);
  }
}

function contentTypeFor(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case ".exe":
      return "application/vnd.microsoft.portable-executable";
    case ".dmg":
      return "application/x-apple-diskimage";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}
