import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CommercialApiClient,
  CommercialApiError,
  EncryptedFileCommercialSessionStore,
} from "../src/commercial.ts";
import { EncryptedFileCommercialDeviceIdentity } from "../src/commercial-device.ts";

class MemorySessionStore {
  value = null;

  async load() {
    return this.value;
  }

  async save(value) {
    this.value = structuredClone(value);
  }

  async clear() {
    this.value = null;
  }
}

const passthroughSecureStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value, "utf8"),
  decryptString: (value) => value.toString("utf8"),
};

const loginResponse = {
  accessToken: "client-jwt",
  expiresIn: 3600,
  user: {
    id: 1001,
    username: "client_user",
    nickname: "客户端用户",
    email: "client@example.com",
    avatar: "",
  },
  tenant: {
    id: 11,
    code: "customer-a",
    name: "客户 A",
    isSystem: false,
  },
};

test("login persists the secret but returns only a renderer-safe summary", async () => {
  const calls = [];
  const store = new MemorySessionStore();
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: store,
    now: () => 1_000,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json(loginResponse);
    },
  });

  const summary = await client.login({
    tenantCode: "customer-a",
    username: "client_user",
    password: "secret",
    rememberMe: true,
  });

  assert.equal(summary.user.username, "client_user");
  assert.equal(summary.expiresAtEpochMs, 3_601_000);
  assert.equal(Object.hasOwn(summary, "accessToken"), false);
  assert.equal(store.value.accessToken, "client-jwt");
  assert.equal(calls[0].url, "https://gateway.test/api/v1/client/auth/login");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    tenantCode: "customer-a",
    username: "client_user",
    password: "secret",
    rememberMe: true,
  });
  assert.equal(new Headers(calls[0].init.headers).has("Authorization"), false);
});

test("concurrent authenticated calls single-flight an expiring token refresh", async () => {
  const calls = [];
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://gateway.test",
    accessToken: "old-jwt",
    expiresAtEpochMs: 1_500,
    user: loginResponse.user,
    tenant: loginResponse.tenant,
  };
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: store,
    now: () => 1_000,
    fetchImpl: async (url, init) => {
      const href = String(url);
      calls.push({ url: href, init });
      if (href.endsWith("/api/v1/client/auth/refresh")) {
        await Promise.resolve();
        return Response.json({ accessToken: "new-jwt", expiresIn: 3600 });
      }
      return Response.json({ ok: true });
    },
  });

  await Promise.all([client.quotaBalance(), client.modelCatalog({ operation: "TEXT" })]);

  assert.equal(
    calls.filter((call) => call.url.endsWith("/api/v1/client/auth/refresh")).length,
    1,
  );
  const businessCalls = calls.filter(
    (call) => !call.url.endsWith("/api/v1/client/auth/refresh"),
  );
  assert.equal(businessCalls.length, 2);
  for (const call of businessCalls) {
    assert.equal(new Headers(call.init.headers).get("Authorization"), "Bearer new-jwt");
  }
  assert.equal(store.value.accessToken, "new-jwt");
});

test("logout clears the local secret when remote revocation is offline", async () => {
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://gateway.test",
    accessToken: "client-jwt",
    expiresAtEpochMs: 3_601_000,
    user: loginResponse.user,
    tenant: loginResponse.tenant,
  };
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: store,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });

  assert.deepEqual(await client.logout(), { remoteRevoked: false });
  assert.equal(store.value, null);
});

function authenticatedClient(fetchImpl, options = {}) {
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://gateway.test",
    accessToken: "client-jwt",
    expiresAtEpochMs: 3_601_000,
    user: loginResponse.user,
    tenant: loginResponse.tenant,
  };
  return new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: store,
    now: () => 1_000,
    fetchImpl,
    ...options,
  });
}

test("release artifact download projects and validates the gateway contract", async () => {
  const artifact = {
    url: "https://files.gateway.test/shared/token",
    fileName: "toonflow-1.1.0-x64.exe",
    contentType: "application/octet-stream",
    sha256: "a".repeat(64),
    sizeBytes: 98234123,
    signature: "artifact-signature",
    expiresAt: "2026-07-23T10:15:00Z",
  };
  const calls = [];
  const client = authenticatedClient(async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(artifact);
  });

  const result = await client.releaseArtifactDownload(1201);

  assert.deepEqual(result, artifact);
  assert.equal(
    calls[0].url,
    "https://gateway.test/api/v1/client/releases/artifacts/1201/download",
  );
  assert.equal(
    new Headers(calls[0].init.headers).get("Authorization"),
    "Bearer client-jwt",
  );
});

test("release artifact download rejects invalid sha256", async () => {
  const client = authenticatedClient(async () =>
    Response.json({
      url: "https://files.gateway.test/shared/token",
      fileName: "installer.exe",
      contentType: "application/octet-stream",
      sha256: "not-hex",
      sizeBytes: 100,
      signature: "sig",
    }),
  );
  await assert.rejects(
    () => client.releaseArtifactDownload(1),
    /sha256/,
  );
});

test("invocation list sends paged query and validates page bounds", async () => {
  const calls = [];
  const client = authenticatedClient(async (url, init) => {
    calls.push(String(url));
    return Response.json({ items: [] });
  });

  await client.listInvocations({
    page: 2,
    pageSize: 50,
    status: "RUNNING",
    operation: "VIDEO",
  });
  assert.equal(
    calls[0],
    "https://gateway.test/api/v1/client/relay/invocations?page=2&pageSize=50&status=RUNNING&operation=VIDEO",
  );
  await assert.rejects(
    async () => {
      await client.listInvocations({ page: 0 });
    },
    /page/,
  );
  await assert.rejects(
    async () => {
      await client.listInvocations({ pageSize: 101 });
    },
    /pageSize/,
  );
});

test("invocation result downloads raw bytes and refreshes once on 401", async () => {
  const calls = [];
  const clientStore = new MemorySessionStore();
  clientStore.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://gateway.test",
    accessToken: "old-jwt",
    expiresAtEpochMs: 3_601_000,
    user: loginResponse.user,
    tenant: loginResponse.tenant,
  };
  const refreshed = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: clientStore,
    now: () => 1_000,
    fetchImpl: async (url, init) => {
      const href = String(url);
      calls.push(href);
      if (href.endsWith("/api/v1/client/auth/refresh")) {
        return Response.json({ accessToken: "new-jwt", expiresIn: 3600 });
      }
      if (new Headers(init.headers).get("Authorization") === "Bearer old-jwt") {
        return new Response(null, { status: 401 });
      }
      return new Response(Uint8Array.from([1, 2, 3, 4]));
    },
  });

  const bytes = await refreshed.invocationResult("inv-7");
  assert.deepEqual([...bytes], [1, 2, 3, 4]);
  assert.equal(
    calls.filter((url) => url.endsWith("/invocations/inv-7/result")).length,
    2,
  );
  assert.equal(clientStore.value.accessToken, "new-jwt");
});

test("file object upload flow follows the documented gateway contract", async () => {
  const calls = [];
  const client = authenticatedClient(async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.endsWith("/api/v1/files/uploads")) {
      return Response.json({ fileId: 1201 });
    }
    if (href.endsWith("/api/v1/files/1201/content")) {
      return init.method === "PUT"
        ? new Response(null, { status: 204 })
        : new Response(Uint8Array.from([9, 8, 7]));
    }
    return Response.json({});
  });

  const { fileId } = await client.createFileUpload({
    fileName: "reference.png",
    contentType: "image/png",
    size: 245812,
  });
  assert.equal(fileId, 1201);

  await client.uploadFileContent(fileId, "image/png", Uint8Array.from([9, 8, 7]));
  const uploadCall = calls.find((call) =>
    call.url.endsWith("/api/v1/files/1201/content"),
  );
  assert.equal(uploadCall.init.method, "PUT");
  assert.equal(
    new Headers(uploadCall.init.headers).get("Content-Type"),
    "image/png",
  );
  assert.deepEqual([...uploadCall.init.body], [9, 8, 7]);

  const bytes = await client.downloadFileBytes(1201);
  assert.deepEqual([...bytes], [9, 8, 7]);
  assert.equal(
    calls.find((call) => call.url.endsWith("/content") && call.init.method === "GET").url,
    "https://gateway.test/api/v1/files/1201/content",
  );
});

test("file object upload validates metadata and byte payload", async () => {
  const client = authenticatedClient(async () => Response.json({ fileId: 1 }));
  await assert.rejects(
    async () => {
      await client.createFileUpload({
        fileName: "",
        contentType: "image/png",
        size: 1,
      });
    },
    /fileName/,
  );
  await assert.rejects(
    async () => {
      await client.createFileUpload({
        fileName: "x",
        contentType: "image",
        size: 1,
      });
    },
    /contentType/,
  );
  await assert.rejects(
    async () => {
      await client.createFileUpload({
        fileName: "x",
        contentType: "image/png",
        size: 0,
      });
    },
    /size/,
  );
  await assert.rejects(
    async () => {
      await client.uploadFileContent(1, "image/png", new Uint8Array(0));
    },
    /文件内容/,
  );
});

test("public Logo is bounded and returned as a renderer-safe data URL", async () => {
  const client = new CommercialApiClient({
    baseUrl: "http://127.0.0.1:8889",
    sessionStore: new MemorySessionStore(),
    fetchImpl: async () =>
      new Response(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), {
        headers: { "Content-Type": "image/png" },
      }),
  });

  assert.deepEqual(await client.publicLogo("customer-a"), {
    contentType: "image/png",
    dataUrl: "data:image/png;base64,iVBORw==",
  });
});

test("public captcha is converted to a bounded renderer-safe image", async () => {
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: new MemorySessionStore(),
    fetchImpl: async () =>
      Response.json({ key: "captcha-key", svg: '<svg viewBox="0 0 10 10"></svg>' }),
  });

  const captcha = await client.publicCaptcha("customer-a");

  assert.equal(captcha.key, "captcha-key");
  assert.match(captcha.imageDataUrl, /^data:image\/svg\+xml;base64,/);
  assert.equal(Object.hasOwn(captcha, "svg"), false);
});

test("plain HTTP is restricted to loopback or the single approved Gateway", () => {
  assert.doesNotThrow(
    () =>
      new CommercialApiClient({
        baseUrl: "http://122.193.11.199:8889",
        sessionStore: new MemorySessionStore(),
      }),
  );
  assert.throws(
    () =>
      new CommercialApiClient({
        baseUrl: "http://gateway.example",
        sessionStore: new MemorySessionStore(),
      }),
    (error) =>
      error instanceof CommercialApiError && error.message.includes("HTTPS"),
  );
});

test("encrypted session storage atomically replaces an existing file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-commercial-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new EncryptedFileCommercialSessionStore(
    join(directory, "session.bin"),
    passthroughSecureStorage,
  );
  const first = {
    schemaVersion: 1,
    gatewayOrigin: "https://gateway.test",
    accessToken: "first-jwt",
    expiresAtEpochMs: 1_000,
    user: loginResponse.user,
    tenant: loginResponse.tenant,
  };
  const second = { ...first, accessToken: "second-jwt", expiresAtEpochMs: 2_000 };

  await store.save(first);
  await store.save(second);

  const restored = await store.load();
  assert.equal(restored.accessToken, "second-jwt");
  assert.equal(restored.expiresAtEpochMs, 2_000);
  assert.equal(restored.user.username, "client_user");
  assert.equal(restored.tenant.code, "customer-a");
});

test("device identity survives re-instantiation and signs the exact challenge", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-device-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "device.bin");
  const first = new EncryptedFileCommercialDeviceIdentity(
    filePath,
    passthroughSecureStorage,
  );
  const summary = await first.summary();
  const message = "  exact challenge bytes\n";
  const signature = await first.signMessage(message);
  const restored = new EncryptedFileCommercialDeviceIdentity(
    filePath,
    passthroughSecureStorage,
  );

  assert.deepEqual(await restored.summary(), summary);
  assert.equal(Object.hasOwn(summary, "privateKeyPkcs8"), false);
  const rawPublicKey = Buffer.from(summary.publicKey, "base64");
  const publicKey = createPublicKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      x: rawPublicKey.toString("base64url"),
    },
    format: "jwk",
  });
  assert.equal(
    verify(
      null,
      Buffer.from(message, "utf8"),
      publicKey,
      Buffer.from(signature, "base64"),
    ),
    true,
  );
});

test("license challenge and activation reuse one request ID", async () => {
  const calls = [];
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://gateway.test",
    accessToken: "client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user: loginResponse.user,
    tenant: loginResponse.tenant,
  };
  let signedMessage = null;
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: store,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      if (String(url).endsWith("/challenge")) {
        return Response.json({
          id: "challenge-id",
          challenge: "random-value",
          message: " exact bytes ",
          signatureAlgorithm: "Ed25519",
        });
      }
      return Response.json({ device: {}, activation: {}, lease: {} });
    },
  });

  await client.activateLicense({
    licenseId: "license-id",
    device: {
      summary: async () => ({
        publicKey: "public-key",
        publicKeyHash: "public-key-hash",
      }),
      signMessage: async (message) => {
        signedMessage = message;
        return "signature";
      },
    },
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.3",
  });

  assert.equal(signedMessage, " exact bytes ");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.requestId, calls[1].body.requestId);
  assert.equal(calls[1].body.challengeSignature, "signature");
});
