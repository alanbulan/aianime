// Copyright (c) 2026 AI anime

import assert from "node:assert/strict";
import {
  createHash,
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
  verifyEd25519ArtifactSignature,
  verifyWindowsAuthenticodeSignature,
} from "../src/commercial-artifact.ts";

const payload = Buffer.from("AI anime artifact payload for verification", "utf8");

function signedMetadata(overrides = {}) {
  return {
    url: "https://files.gateway.test/shared/token",
    fileName: "toonflow-1.1.0-x64.exe",
    contentType: "application/octet-stream",
    sha256: createHash("sha256").update(payload).digest("hex"),
    sizeBytes: payload.byteLength,
    signature: "sig",
    ...overrides,
  };
}

function ed25519Fixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const metadata = signedMetadata({
    signature: sign(null, payload, privateKey).toString("base64"),
  });
  return { publicKeyPem, metadata };
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
  const { publicKeyPem, metadata } = ed25519Fixture();
  const tempDir = await mkdtemp(join(tmpdir(), "ai-anime-artifact-test-"));
  try {
    const result = await downloadAndVerifyReleaseArtifact(metadata, {
      fetchImpl: async () => responseFromBytes(payload),
      tempDir,
      verifySignature: (data, meta) =>
        verifyEd25519ArtifactSignature(publicKeyPem, data, meta),
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
  const { publicKeyPem, metadata } = ed25519Fixture();
  metadata.sha256 = "b".repeat(64);
  const tempDir = await mkdtemp(join(tmpdir(), "ai-anime-artifact-test-"));
  await assert.rejects(
    () =>
      downloadAndVerifyReleaseArtifact(metadata, {
        fetchImpl: async () => responseFromBytes(payload),
        tempDir,
        verifySignature: (data, meta) =>
          verifyEd25519ArtifactSignature(publicKeyPem, data, meta),
      }),
    /SHA-256/,
  );
  assert.deepEqual(await readdir(tempDir), []);
  await rm(tempDir, { recursive: true, force: true });
});

test("rejects a content-length mismatch before writing", async () => {
  const { publicKeyPem, metadata } = ed25519Fixture();
  const tempDir = await mkdtemp(join(tmpdir(), "ai-anime-artifact-test-"));
  await assert.rejects(
    () =>
      downloadAndVerifyReleaseArtifact(metadata, {
        fetchImpl: async () =>
          responseWithHeader(payload, payload.byteLength + 1),
        tempDir,
        verifySignature: (data, meta) =>
          verifyEd25519ArtifactSignature(publicKeyPem, data, meta),
      }),
    /长度/,
  );
  assert.deepEqual(await readdir(tempDir), []);
  await rm(tempDir, { recursive: true, force: true });
});

test("rejects when the stream exceeds the declared size", async () => {
  const { publicKeyPem, metadata } = ed25519Fixture();
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
          verifyEd25519ArtifactSignature(publicKeyPem, data, meta),
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
  const { publicKeyPem, metadata } = ed25519Fixture();
  metadata.expiresAt = "2020-01-01T00:00:00Z";
  await assert.rejects(
    () =>
      downloadAndVerifyReleaseArtifact(metadata, {
        fetchImpl: async () => responseFromBytes(payload),
        verifySignature: (data, meta) =>
          verifyEd25519ArtifactSignature(publicKeyPem, data, meta),
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
