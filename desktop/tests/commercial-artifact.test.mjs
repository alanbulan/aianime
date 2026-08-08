// Copyright (c) 2026 AI anime

import assert from "node:assert/strict";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ArtifactVerificationError,
  downloadAndVerifyReleaseArtifact,
  isReleaseArtifactTempPath,
  sha256File,
  verifyEd25519ArtifactSignature,
  verifyWindowsAuthenticodeSignature,
} from "../src/commercial-artifact.ts";
import {
  COMMERCIAL_ARTIFACT_SIGNING_KEYS,
  COMMERCIAL_LEASE_SIGNING_KEYS,
} from "../src/commercial-trust.ts";

const payload = Buffer.from("AI anime artifact payload for verification", "utf8");

function signedMetadata(overrides = {}) {
  return {
    url: "https://files.gateway.test/shared/token",
    fileName: "toonflow-1.1.0-x64.exe",
    contentType: "application/octet-stream",
    sha256: createHash("sha256").update(payload).digest("hex"),
    sizeBytes: payload.byteLength,
    signatureKeyId: "artifact-test-v1",
    signature: "sig",
    expiresAt: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function ed25519Fixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const metadata = signedMetadata({
    signature: sign(null, payload, privateKey).toString("base64"),
  });
  return {
    publicKeys: { [metadata.signatureKeyId]: publicKeyPem },
    metadata,
  };
}

async function responseFromBytes(bytes) {
  return new Response(bytes);
}

function responseWithHeader(bytes, contentLength) {
  let offset = 0;
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name) =>
        name === "content-length" ? String(contentLength) : null,
    },
    body: {
      getReader: () => ({
        async read() {
          if (offset >= bytes.length) return { done: true };
          const end = Math.min(offset + 16, bytes.length);
          const chunk = bytes.subarray(offset, end);
          offset = end;
          return { done: false, value: chunk };
        },
        cancel: () => undefined,
      }),
    },
  };
}

test("downloads and verifies a signed artifact then leaves the verified file", async () => {
  const { publicKeys, metadata } = ed25519Fixture();
  const tempDir = await mkdtemp(join(tmpdir(), "ai-anime-artifact-test-"));
  try {
    const result = await downloadAndVerifyReleaseArtifact(metadata, {
      fetchImpl: async () => responseFromBytes(payload),
      tempDir,
      verifySignature: (data, meta) =>
        verifyEd25519ArtifactSignature(publicKeys, data, meta),
    });
    assert.equal(result.fileName, metadata.fileName);
    assert.equal(result.sha256, metadata.sha256);
    assert.equal(result.sizeBytes, payload.byteLength);
    assert.deepEqual(await readFile(result.filePath), payload);
    const entries = await readdir(tempDir);
    assert.equal(entries.length, 1);
    assert.equal(
      result.filePath,
      join(tempDir, entries[0], metadata.fileName),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("rejects an artifact whose sha256 does not match and cleans up", async () => {
  const { publicKeys, metadata } = ed25519Fixture();
  metadata.sha256 = "b".repeat(64);
  const tempDir = await mkdtemp(join(tmpdir(), "ai-anime-artifact-test-"));
  await assert.rejects(
    () =>
      downloadAndVerifyReleaseArtifact(metadata, {
        fetchImpl: async () => responseFromBytes(payload),
        tempDir,
        verifySignature: (data, meta) =>
          verifyEd25519ArtifactSignature(publicKeys, data, meta),
      }),
    /SHA-256/,
  );
  assert.deepEqual(await readdir(tempDir), []);
  await rm(tempDir, { recursive: true, force: true });
});

test("rejects a content-length mismatch before writing", async () => {
  const { publicKeys, metadata } = ed25519Fixture();
  const tempDir = await mkdtemp(join(tmpdir(), "ai-anime-artifact-test-"));
  await assert.rejects(
    () =>
      downloadAndVerifyReleaseArtifact(metadata, {
        fetchImpl: async () =>
          responseWithHeader(payload, payload.byteLength + 1),
        tempDir,
        verifySignature: (data, meta) =>
          verifyEd25519ArtifactSignature(publicKeys, data, meta),
      }),
    /长度/,
  );
  assert.deepEqual(await readdir(tempDir), []);
  await rm(tempDir, { recursive: true, force: true });
});

test("rejects when the stream exceeds the declared size", async () => {
  const { publicKeys, metadata } = ed25519Fixture();
  metadata.sizeBytes = 4;
  const tempDir = await mkdtemp(join(tmpdir(), "ai-anime-artifact-test-"));
  const stream = ReadableStream.from([
    payload.subarray(0, 2),
    payload.subarray(2, 6),
  ]);
  await assert.rejects(
    () =>
      downloadAndVerifyReleaseArtifact(metadata, {
        fetchImpl: async () => new Response(stream),
        tempDir,
        verifySignature: (data, meta) =>
          verifyEd25519ArtifactSignature(publicKeys, data, meta),
      }),
    /超过网关声明大小/,
  );
  assert.deepEqual(await readdir(tempDir), []);
  await rm(tempDir, { recursive: true, force: true });
});

test("rejects an invalid signature and cleans up", async () => {
  const { metadata } = ed25519Fixture();
  metadata.signature = Buffer.from("not-a-real-signature").toString("base64");
  const tempDir = await mkdtemp(join(tmpdir(), "ai-anime-artifact-test-"));
  await assert.rejects(
    () =>
      downloadAndVerifyReleaseArtifact(metadata, {
        fetchImpl: async () => responseFromBytes(payload),
        tempDir,
        verifySignature: (data, meta) => {
          void data;
          void meta;
          throw new ArtifactVerificationError("制品签名校验失败");
        },
      }),
    /签名/,
  );
  assert.deepEqual(await readdir(tempDir), []);
  await rm(tempDir, { recursive: true, force: true });
});

test("rejects an expired download link", async () => {
  const { publicKeys, metadata } = ed25519Fixture();
  metadata.expiresAt = "2020-01-01T00:00:00Z";
  await assert.rejects(
    () =>
      downloadAndVerifyReleaseArtifact(metadata, {
        fetchImpl: async () => responseFromBytes(payload),
        verifySignature: (data, meta) =>
          verifyEd25519ArtifactSignature(publicKeys, data, meta),
      }),
    /已过期/,
  );
});

test("fails closed when no verification key is configured", async () => {
  const { metadata } = ed25519Fixture();
  await assert.rejects(
    () =>
      downloadAndVerifyReleaseArtifact(metadata, {
        fetchImpl: async () => responseFromBytes(payload),
        verifySignature: () => {
          throw new ArtifactVerificationError(
            "未配置制品签名公钥，拒绝安装",
          );
        },
      }),
    /未配置制品签名公钥/,
  );
});

test("rejects an unknown artifact signature key id", () => {
  const { metadata } = ed25519Fixture();
  assert.throws(
    () => verifyEd25519ArtifactSignature({}, payload, metadata),
    /未配置制品签名公钥/,
  );
});

test("recognizes only direct files inside generated artifact directories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "ai-anime-temp-root-"));
  try {
    const artifactDirectory = join(tempDir, "ai-anime-artifact-Ab12cd");
    const artifactPath = join(artifactDirectory, "installer.exe");
    assert.equal(isReleaseArtifactTempPath(artifactPath, tempDir), true);
    assert.equal(
      isReleaseArtifactTempPath(join(artifactDirectory, "nested", "installer.exe"), tempDir),
      false,
    );
    assert.equal(
      isReleaseArtifactTempPath(join(tempDir, "installer.exe"), tempDir),
      false,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("hashes an installed artifact without loading it through the renderer", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "ai-anime-hash-test-"));
  const filePath = join(tempDir, "installer.exe");
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, payload);
    assert.equal(
      await sha256File(filePath),
      createHash("sha256").update(payload).digest("hex"),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("windows authenticode accepts a Valid signature and rejects invalid output", async () => {
  const validRun = async () => ({
    code: 0,
    stdout: JSON.stringify({ Status: "Valid", Publisher: "CN=AI Anime Ltd" }),
  });
  await verifyWindowsAuthenticodeSignature("C:\\tmp\\installer.exe", {
    platform: "win32",
    run: validRun,
    allowedPublisher: "AI Anime Ltd",
  });
  await assert.rejects(
    () =>
      verifyWindowsAuthenticodeSignature("C:\\tmp\\installer.exe", {
        platform: "win32",
        run: async () => ({
          code: 0,
          stdout: JSON.stringify({ Status: "NotSigned", Publisher: "" }),
        }),
      }),
    /Authenticode/,
  );
  await assert.rejects(
    () =>
      verifyWindowsAuthenticodeSignature("C:\\tmp\\installer.exe", {
        platform: "win32",
        run: validRun,
        allowedPublisher: "Other Publisher",
      }),
    /发布者/,
  );
  await assert.rejects(
    () =>
      verifyWindowsAuthenticodeSignature("C:\\tmp\\installer.exe", {
        platform: "win32",
        run: async () => ({ code: 1, stdout: "" }),
      }),
    /无法执行/,
  );
});

test("windows authenticode is skipped on non-windows platforms", async () => {
  let ran = false;
  await verifyWindowsAuthenticodeSignature("/tmp/installer", {
    platform: "darwin",
    run: async () => {
      ran = true;
      return { code: 0, stdout: "" };
    },
  });
  assert.equal(ran, false);
});

test("production trust roots and package signing gates remain configured", async () => {
  assert.deepEqual(Object.keys(COMMERCIAL_ARTIFACT_SIGNING_KEYS), [
    "artifact-2026-08-v1",
  ]);
  assert.deepEqual(Object.keys(COMMERCIAL_LEASE_SIGNING_KEYS), [
    "lease-2026-08-v1",
  ]);
  for (const publicKeyPem of [
    ...Object.values(COMMERCIAL_ARTIFACT_SIGNING_KEYS),
    ...Object.values(COMMERCIAL_LEASE_SIGNING_KEYS),
  ]) {
    assert.equal(createPublicKey(publicKeyPem).asymmetricKeyType, "ed25519");
  }

  const builderConfig = await readFile(
    new URL("../electron-builder.yml", import.meta.url),
    "utf8",
  );
  assert.equal(
    builderConfig.match(/forceCodeSigning: true/g)?.length,
    2,
  );
  assert.match(builderConfig, /hardenedRuntime: true/);
  assert.match(builderConfig, /notarize: true/);
});
