// Copyright (c) 2026 AI anime

import { createHash, createPublicKey, verify } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  type WriteStream,
} from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type { CommercialArtifactDownloadSnapshot } from "./commercial-contracts.js";

export class ArtifactVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactVerificationError";
  }
}

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30 * 60_000;

export interface ArtifactDownloadResult {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
}

export interface ArtifactDownloadOptions {
  fetchImpl?: typeof fetch;
  tempDir?: string;
  timeoutMs?: number;
  now?: () => number;
  /**
   * Verifies `metadata.signature` against the downloaded bytes. Any throw
   * fails the download and removes the temp file. When omitted the download
   * is rejected: a client without a trusted verification key must never
   * install an unverified artifact.
   */
  verifySignature: (
    data: Buffer,
    metadata: CommercialArtifactDownloadSnapshot,
  ) => void | Promise<void>;
  /**
   * Windows-only Authenticode publisher verification. When provided on
   * win32, any throw fails the download and removes the temp file.
   */
  verifyAuthenticode?: (filePath: string) => void | Promise<void>;
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export function isReleaseArtifactTempPath(
  filePath: string,
  tempDirectory = tmpdir(),
): boolean {
  const relativePath = relative(resolve(tempDirectory), resolve(filePath));
  if (!relativePath || isAbsolute(relativePath)) return false;
  const segments = relativePath.split(sep);
  const directory = segments[0] ?? "";
  return (
    segments.length === 2 &&
    directory.startsWith("ai-anime-artifact-") &&
    directory.length > "ai-anime-artifact-".length &&
    Boolean(segments[1])
  );
}

function assertValidArtifactMetadata(
  metadata: CommercialArtifactDownloadSnapshot,
  now: () => number,
): void {
  if (!/^[0-9a-f]{64}$/.test(metadata.sha256)) {
    throw new ArtifactVerificationError("制品 SHA-256 摘要无效");
  }
  if (
    typeof metadata.sizeBytes !== "number" ||
    !Number.isSafeInteger(metadata.sizeBytes) ||
    metadata.sizeBytes <= 0
  ) {
    throw new ArtifactVerificationError("制品大小无效");
  }
  if (!metadata.signature) {
    throw new ArtifactVerificationError("制品缺少签名");
  }
  const expiresAtMs = Date.parse(metadata.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now()) {
    throw new ArtifactVerificationError("制品下载链接已过期");
  }
}

/**
 * Downloads a release artifact from the short-lived Gateway link, verifies
 * length, SHA-256 and signature in the main process, and only then returns a
 * path the caller may install. Any failure removes the temp file.
 */
export async function downloadAndVerifyReleaseArtifact(
  metadata: CommercialArtifactDownloadSnapshot,
  options: ArtifactDownloadOptions,
): Promise<ArtifactDownloadResult> {
  const now = options.now ?? Date.now;
  assertValidArtifactMetadata(metadata, now);

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
  const tempDir = options.tempDir ?? tmpdir();
  let tempRoot: string | null = null;
  let stream: WriteStream | null = null;

  const cleanup = async (): Promise<void> => {
    stream?.destroy();
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  };

  let response: Response;
  try {
    response = await fetchImpl(metadata.url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
  } catch (error) {
    await cleanup();
    throw new ArtifactVerificationError(
      error instanceof Error ? `制品下载失败：${error.message}` : "制品下载失败",
    );
  }

  if (!response.ok || !response.body) {
    await cleanup();
    throw new ArtifactVerificationError(
      `制品下载响应失败（HTTP ${response.status}）`,
    );
  }

  const declaredLengthHeader = response.headers.get("content-length");
  const declaredLength =
    declaredLengthHeader === null ? null : Number(declaredLengthHeader);
  if (
    declaredLength !== null &&
    Number.isFinite(declaredLength) &&
    declaredLength !== metadata.sizeBytes
  ) {
    await cleanup();
    throw new ArtifactVerificationError("制品长度与网关声明不一致");
  }

  try {
    tempRoot = await mkdtemp(join(tempDir, "ai-anime-artifact-"));
    const filePath = join(tempRoot, metadata.fileName.replace(/[\\/:*?"<>|]/g, "_"));
    stream = createWriteStream(filePath, { flags: "wx" });
    const hash = createHash("sha256");
    let receivedBytes = 0;

    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > metadata.sizeBytes) {
        throw new ArtifactVerificationError("制品字节数超过网关声明大小");
      }
      hash.update(value);
      if (!stream.write(value)) {
        await new Promise<void>((resolve, reject) => {
          stream?.once("drain", resolve);
          stream?.once("error", reject);
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      stream?.end((error?: Error | null) =>
        error ? reject(error) : resolve(),
      );
    });
    stream = null;

    if (receivedBytes !== metadata.sizeBytes) {
      throw new ArtifactVerificationError("制品字节数与网关声明大小不一致");
    }
    const digest = hash.digest("hex");
    if (digest !== metadata.sha256) {
      throw new ArtifactVerificationError("制品 SHA-256 校验失败");
    }

    // Re-read the file so the signature verifier sees exactly the stored bytes.
    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(filePath);

    await options.verifySignature(bytes, metadata);

    if (options.verifyAuthenticode) {
      await options.verifyAuthenticode(filePath);
    }

    return {
      filePath,
      fileName: metadata.fileName,
      sizeBytes: receivedBytes,
      sha256: digest,
    };
  } catch (error) {
    await cleanup();
    if (error instanceof ArtifactVerificationError) throw error;
    throw new ArtifactVerificationError(
      error instanceof Error ? error.message : "制品下载校验失败",
    );
  }
}

/**
 * Ed25519 artifact signature verification against a pinned SPKI public key.
 * The signature is over the raw downloaded bytes (base64 in the metadata).
 */
export function verifyEd25519ArtifactSignature(
  publicKeys: Readonly<Record<string, string>>,
  data: Buffer,
  metadata: CommercialArtifactDownloadSnapshot,
): void {
  const publicKeyPem = publicKeys[metadata.signatureKeyId];
  if (!publicKeyPem?.trim()) {
    throw new ArtifactVerificationError(
      `未配置制品签名公钥：${metadata.signatureKeyId}`,
    );
  }
  let publicKey;
  try {
    publicKey = createPublicKey({
      key: publicKeyPem,
      format: "pem",
      type: "spki",
    });
  } catch {
    throw new ArtifactVerificationError("制品签名公钥无效");
  }
  const signature = Buffer.from(metadata.signature, "base64");
  if (signature.byteLength !== 64) {
    throw new ArtifactVerificationError("制品签名编码无效");
  }
  let valid = false;
  try {
    valid = verify(null, data, publicKey, signature);
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new ArtifactVerificationError("制品签名校验失败");
  }
}

export interface AuthenticodeRunnerResult {
  code: number;
  stdout: string;
  stderr?: string;
}

export interface AuthenticodeVerifyOptions {
  platform?: NodeJS.Platform;
  allowedPublisher?: string;
  run?: (
    command: string,
    args: string[],
  ) => Promise<AuthenticodeRunnerResult>;
}

const defaultAuthenticodeRun = async (
  command: string,
  args: string[],
): Promise<AuthenticodeRunnerResult> => {
  const { spawn } = await import("node:child_process");
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
};

/**
 * Windows Authenticode publisher verification. Non-Windows platforms are
 * skipped (no Authenticode there). Fails closed on any runner error or when
 * the signature is not Valid.
 */
export async function verifyWindowsAuthenticodeSignature(
  filePath: string,
  options: AuthenticodeVerifyOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") return;

  const run = options.run ?? defaultAuthenticodeRun;
  const escapedPath = filePath.replace(/'/g, "''");
  const command =
    "Import-Module (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; Get-AuthenticodeSignature -LiteralPath '" +
    escapedPath +
    "' | Select-Object -Property @{Name='Status';Expression={$_.Status.ToString()}},@{Name='Publisher';Expression={$_.SignerCertificate.Subject}} | ConvertTo-Json -Compress";
  const result = await run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    command,
  ]);
  if (result.code !== 0) {
    throw new ArtifactVerificationError(
      "Windows 安装包 Authenticode 校验无法执行",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    throw new ArtifactVerificationError("Windows 安装包 Authenticode 输出无效");
  }
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const status = typeof record?.Status === "string" ? record.Status : "";
  if (status.toUpperCase() !== "VALID") {
    throw new ArtifactVerificationError(
      `Windows 安装包 Authenticode 签名无效（${status || "未知"}）`,
    );
  }
  if (options.allowedPublisher) {
    const publisher = typeof record?.Publisher === "string" ? record.Publisher : "";
    if (!publisher.includes(options.allowedPublisher)) {
      throw new ArtifactVerificationError(
        "Windows 安装包发布者不在允许名单内",
      );
    }
  }
}
