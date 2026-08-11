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

class MemoryRememberedLoginStore extends MemorySessionStore {}

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
  assert.equal(Object.hasOwn(summary, "rememberedLogin"), false);
  assert.equal(store.value.accessToken, "client-jwt");
  assert.equal(store.value.rememberMe, true);
  assert.deepEqual(store.value.rememberedLogin, {
    tenantCode: "customer-a",
    username: "client_user",
    password: "secret",
  });
  assert.equal(calls[0].url, "https://gateway.test/api/v1/client/auth/login");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    tenantCode: "customer-a",
    username: "client_user",
    password: "secret",
    rememberMe: true,
  });
  assert.equal(new Headers(calls[0].init.headers).has("Authorization"), false);
});

test("remembered credentials stay encrypted outside the renderer session", async () => {
  const sessionStore = new MemorySessionStore();
  const rememberedLoginStore = new MemoryRememberedLoginStore();
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore,
    rememberedLoginStore,
    now: () => 1_000,
    fetchImpl: async () => Response.json(loginResponse),
  });

  await client.login({
    tenantCode: "customer-a",
    username: "client_user",
    password: "secret",
    rememberMe: true,
  });

  assert.deepEqual(await client.rememberedLogin(), {
    tenantCode: "customer-a",
    username: "client_user",
    hasPassword: true,
  });
  assert.equal(rememberedLoginStore.value.password, "secret");
});

test("login without remember-me keeps the session only for the current process", async () => {
  const store = new MemorySessionStore();
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: store,
    now: () => 1_000,
    fetchImpl: async () => Response.json(loginResponse),
  });

  const session = await client.login({
    tenantCode: "customer-a",
    username: "client_user",
    password: "secret",
    rememberMe: false,
  });

  assert.equal(store.value, null);
  assert.deepEqual(await client.restoreSession(), session);
  const restartedClient = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: store,
    now: () => 1_000,
    fetchImpl: async () => Response.json(loginResponse),
  });
  assert.equal(await restartedClient.restoreSession(), null);
});

test("public registration sends only the documented account fields", async () => {
  const calls = [];
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: new MemorySessionStore(),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 204 });
    },
  });

  await client.register({
    tenantCode: "customer-a",
    username: "new-user",
    password: "Secret123",
    nickname: "New User",
    email: "new@example.com",
    captchaKey: "captcha-key",
    captchaCode: "ABCD",
  });

  assert.equal(calls[0].url, "https://gateway.test/api/v1/auth/register");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    tenantCode: "customer-a",
    username: "new-user",
    password: "Secret123",
    nickname: "New User",
    email: "new@example.com",
    captchaKey: "captcha-key",
    captchaCode: "ABCD",
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

test("remembered login automatically reauthenticates after refresh is rejected", async () => {
  const calls = [];
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://gateway.test",
    accessToken: "expired-jwt",
    expiresAtEpochMs: 1_500,
    user: loginResponse.user,
    tenant: loginResponse.tenant,
    rememberMe: true,
    rememberedLogin: {
      tenantCode: "customer-a",
      username: "client_user",
      password: "secret",
    },
  };
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: store,
    now: () => 1_000,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/api/v1/client/auth/refresh")) {
        return Response.json({ message: "expired" }, { status: 401 });
      }
      return Response.json({ ...loginResponse, accessToken: "renewed-jwt" });
    },
  });

  const session = await client.restoreSession();

  assert.equal(session.user.username, "client_user");
  assert.equal(store.value.accessToken, "renewed-jwt");
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "https://gateway.test/api/v1/client/auth/refresh",
      "https://gateway.test/api/v1/client/auth/login",
    ],
  );
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    tenantCode: "customer-a",
    username: "client_user",
    password: "secret",
    rememberMe: true,
  });
});

test("remembered login recovers an unexpired token invalidated by a server restart", async () => {
  const calls = [];
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://gateway.test",
    accessToken: "invalidated-jwt",
    expiresAtEpochMs: 3_601_000,
    user: loginResponse.user,
    tenant: loginResponse.tenant,
    rememberMe: true,
    rememberedLogin: {
      tenantCode: "customer-a",
      username: "client_user",
      password: "secret",
    },
  };
  const profile = {
    id: 1001,
    username: "client_user",
    nickname: "客户端用户",
    email: "client@example.com",
    phone: "13800000000",
    gender: 0,
    avatar: "",
    status: 1,
    deptId: 0,
    deptName: "",
    profileDescription: "",
  };
  let profileAttempts = 0;
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: store,
    now: () => 1_000,
    fetchImpl: async (url, init) => {
      const href = String(url);
      calls.push({ url: href, init });
      if (href.endsWith("/api/v1/user/profile")) {
        profileAttempts += 1;
        return profileAttempts === 1
          ? Response.json({ message: "unknown token" }, { status: 401 })
          : Response.json(profile);
      }
      if (href.endsWith("/api/v1/client/auth/refresh")) {
        return Response.json({ message: "unknown token" }, { status: 401 });
      }
      return Response.json({ ...loginResponse, accessToken: "restarted-jwt" });
    },
  });

  assert.deepEqual(await client.currentProfile(), profile);
  assert.equal(store.value.accessToken, "restarted-jwt");
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "https://gateway.test/api/v1/user/profile",
      "https://gateway.test/api/v1/client/auth/refresh",
      "https://gateway.test/api/v1/client/auth/login",
      "https://gateway.test/api/v1/user/profile",
    ],
  );
});

test("transient refresh failures preserve the encrypted remembered session", async () => {
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://gateway.test",
    accessToken: "existing-jwt",
    expiresAtEpochMs: 1_500,
    user: loginResponse.user,
    tenant: loginResponse.tenant,
    rememberMe: true,
    rememberedLogin: {
      tenantCode: "customer-a",
      username: "client_user",
      password: "secret",
    },
  };
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore: store,
    now: () => 1_000,
    fetchImpl: async () =>
      Response.json({ message: "temporarily unavailable" }, { status: 503 }),
  });

  const session = await client.restoreSession();

  assert.equal(session.user.username, "client_user");
  assert.equal(store.value.accessToken, "existing-jwt");
  assert.equal(store.value.rememberedLogin.password, "secret");
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

test("explicit logout clears the token but preserves remembered credentials", async () => {
  const sessionStore = new MemorySessionStore();
  const rememberedLoginStore = new MemoryRememberedLoginStore();
  sessionStore.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://gateway.test",
    accessToken: "client-jwt",
    expiresAtEpochMs: 3_601_000,
    user: loginResponse.user,
    tenant: loginResponse.tenant,
    rememberMe: true,
    rememberedLogin: {
      tenantCode: "customer-a",
      username: "client_user",
      password: "secret",
    },
  };
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test",
    sessionStore,
    rememberedLoginStore,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });

  assert.deepEqual(await client.logout(), { remoteRevoked: false });
  assert.equal(sessionStore.value, null);
  assert.deepEqual(rememberedLoginStore.value, {
    schemaVersion: 1,
    gatewayOrigin: "https://gateway.test",
    tenantCode: "customer-a",
    username: "client_user",
    password: "secret",
  });
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

test("commercial model catalog and details send the activated device id", async () => {
  const calls = [];
  const client = authenticatedClient(async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ catalogVersion: "catalog-v1", items: [] });
  });
  const deviceId = "2217d912-c377-42de-b2eb-759cf172bae2";

  await client.modelCatalog({ operation: "TEXT" }, deviceId);
  await client.modelDetails("DEMO_TEXT", deviceId);
  await client.bootstrap(
    {
      devicePublicKeyHash: "public-key-hash",
      currentVersion: "1.1.5",
      target: "windows",
      arch: "x86_64",
    },
    deviceId,
  );

  assert.equal(
    calls[0].url,
    "https://gateway.test/api/v1/client/models?operation=TEXT",
  );
  assert.equal(
    calls[1].url,
    "https://gateway.test/api/v1/client/models/DEMO_TEXT",
  );
  assert.equal(
    calls[2].url,
    "https://gateway.test/api/v1/client/bootstrap?devicePublicKeyHash=public-key-hash&currentVersion=1.1.5&target=windows&arch=x86_64",
  );
  for (const call of calls) {
    assert.equal(
      new Headers(call.init.headers).get("X-Device-Id"),
      deviceId,
    );
  }
});

test("release update feed keeps the access token in the main process", async () => {
  const client = authenticatedClient(async () => {
    throw new Error("releaseUpdateFeed must not make a network request");
  });

  const feed = await client.releaseUpdateFeed(1201);

  assert.equal(
    feed.url,
    "https://gateway.test/api/v1/client/releases/updater/?artifactId=1201",
  );
  assert.deepEqual(feed.requestHeaders, {
    Authorization: "Bearer client-jwt",
    "Cache-Control": "no-cache",
  });
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

test("account profile and protected avatar stay behind the main-process bearer token", async () => {
  const calls = [];
  const profile = {
    id: 1001,
    username: "client_user",
    nickname: "客户端用户",
    email: "client@example.com",
    phone: "13800000000",
    gender: 0,
    avatar: "/api/v1/user/avatar",
    status: 1,
    deptId: 0,
    deptName: "",
    profileDescription: "分镜创作者",
  };
  const client = authenticatedClient(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/v1/user/avatar")) {
      return new Response(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), {
        headers: { "Content-Type": "image/png" },
      });
    }
    return Response.json(profile);
  });

  assert.deepEqual(await client.currentProfile(), profile);
  assert.deepEqual(await client.currentAvatar(), {
    contentType: "image/png",
    dataUrl: "data:image/png;base64,iVBORw==",
  });

  for (const call of calls) {
    const headers = new Headers(call.init.headers);
    assert.equal(headers.get("Authorization"), "Bearer client-jwt");
    assert.equal(headers.has("X-Device-Id"), false);
  }
});

test("profile replacement and avatar upload use the documented request bodies", async () => {
  const calls = [];
  const profile = {
    id: 1001,
    username: "client_user",
    nickname: "新昵称",
    email: "client@example.com",
    phone: "13800000000",
    gender: 2,
    avatar: "/api/v1/user/avatar",
    status: 1,
    deptId: 0,
    deptName: "",
    profileDescription: "新简介",
  };
  const client = authenticatedClient(async (url, init) => {
    calls.push({ url: String(url), init });
    if (init.method === "PUT") return Response.json({ code: 0, message: "ok" });
    if (init.method === "POST") {
      return Response.json({
        avatar: "/api/v1/user/avatar",
        contentType: "image/png",
        sizeBytes: 4,
      });
    }
    return Response.json(profile);
  });

  await client.updateProfile({
    nickname: "新昵称",
    email: "client@example.com",
    phone: "13800000000",
    gender: 2,
    profileDescription: "新简介",
  });
  await client.uploadAvatar({
    fileName: "avatar.png",
    contentType: "image/png",
    bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
  });

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    nickname: "新昵称",
    email: "client@example.com",
    phone: "13800000000",
    gender: 2,
    profileDescription: "新简介",
  });
  const avatarCall = calls.find((call) => call.init.method === "POST");
  assert.ok(avatarCall.init.body instanceof FormData);
  assert.equal(avatarCall.init.body.get("file").type, "image/png");
  assert.equal(new Headers(avatarCall.init.headers).has("Content-Type"), false);
});

test("password change revokes the stored session and public reset uses three steps", async () => {
  const calls = [];
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
    now: () => 1_000,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/reset-password/verify")) {
        return Response.json({ resetTicket: "single-use-ticket", expiresIn: 600 });
      }
      return Response.json({ success: true });
    },
  });

  await client.changePassword(" Old password ", " New password ");
  assert.equal(store.value, null);
  await client.sendPasswordResetCode("customer-a", "client@example.com");
  assert.deepEqual(
    await client.verifyPasswordResetCode("customer-a", "client@example.com", "123456"),
    { resetTicket: "single-use-ticket", expiresIn: 600 },
  );
  await client.resetPassword("customer-a", "single-use-ticket", " New password ");

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    oldPassword: " Old password ",
    newPassword: " New password ",
  });
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    tenantCode: "customer-a",
    email: "client@example.com",
    scene: "reset",
  });
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    tenantCode: "customer-a",
    email: "client@example.com",
    code: "123456",
  });
  assert.deepEqual(JSON.parse(calls[3].init.body), {
    tenantCode: "customer-a",
    resetTicket: "single-use-ticket",
    newPassword: " New password ",
  });
});

test("plain HTTP is restricted to loopback or the single approved Gateway", () => {
  assert.doesNotThrow(
    () =>
      new CommercialApiClient({
        baseUrl: "https://aianime.122-193-11-199.sslip.io",
        sessionStore: new MemorySessionStore(),
      }),
  );
  assert.throws(
    () =>
      new CommercialApiClient({
        baseUrl: "http://122.193.11.199:8889",
        sessionStore: new MemorySessionStore(),
      }),
    (error) =>
      error instanceof CommercialApiError && error.message.includes("HTTPS"),
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
    rememberMe: true,
    rememberedLogin: {
      tenantCode: "customer-a",
      username: "client_user",
      password: "secret",
    },
  };
  const second = { ...first, accessToken: "second-jwt", expiresAtEpochMs: 2_000 };

  await store.save(first);
  await store.save(second);

  const restored = await store.load();
  assert.equal(restored.accessToken, "second-jwt");
  assert.equal(restored.expiresAtEpochMs, 2_000);
  assert.equal(restored.user.username, "client_user");
  assert.equal(restored.tenant.code, "customer-a");
  assert.equal(restored.rememberedLogin.password, "secret");
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
