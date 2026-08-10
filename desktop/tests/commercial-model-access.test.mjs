import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EncryptedFileCommercialModelAccessStore,
  fetchByokModelCatalog,
} from "../src/commercial-model-access.ts";
import { CommercialModelProxy } from "../src/commercial-model-proxy.ts";
import {
  COMMERCIAL_CHANNELS,
  CommercialApiClient,
  CommercialApiError,
  registerCommercialIpc,
} from "../src/commercial.ts";

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

const user = { id: 1, username: "client" };
const tenant = { id: 2, code: "customer-a", name: "Customer A" };

test("commercial auth IPC preserves exact password text", async () => {
  const handlers = new Map();
  const calls = [];
  registerCommercialIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
    },
    client: {
      baseUrl: "https://gateway.test",
      register: async (input) => calls.push({ type: "register", input }),
      login: async (input) => {
        calls.push({ type: "login", input });
        return {
          authenticated: true,
          expiresAtEpochMs: 10_000,
          user,
          tenant,
        };
      },
      currentLicense: async () => ({
        license: {
          id: "license-1",
          editionType: "PROFESSIONAL",
          allowsCustomModels: true,
        },
        device: { id: "2217d912-c377-42de-b2eb-759cf172bae2" },
        activation: { id: "activation-1" },
        lease: null,
      }),
      modelCatalog: async () => ({
        catalogVersion: "catalog-v1",
        items: [],
      }),
    },
    deviceIdentity: {
      summary: async () => ({ publicKeyHash: "public-key-hash" }),
    },
    modelAccessStore: {
      load: async () => ({
        schemaVersion: 2,
        mode: "cloud",
        byokBaseUrl: "",
        byokApiKey: "",
        byokModelAssignments: [],
      }),
    },
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.5",
    isAllowedSender: () => true,
    onAuthenticated: async () => undefined,
    onModelAccessChanged: async () => undefined,
    onLoggedOut: async () => undefined,
  });

  await handlers.get(COMMERCIAL_CHANNELS.register)(
    { sender: { id: 1 } },
    {
      tenantCode: " customer-a ",
      username: " client ",
      password: " Secret 123 ",
    },
  );
  await handlers.get(COMMERCIAL_CHANNELS.login)(
    { sender: { id: 1 } },
    {
      tenantCode: " customer-a ",
      username: " client ",
      password: " Secret 123 ",
    },
  );

  assert.deepEqual(calls, [
    {
      type: "register",
      input: {
        tenantCode: "customer-a",
        username: "client",
        password: " Secret 123 ",
      },
    },
    {
      type: "login",
      input: {
        tenantCode: "customer-a",
        username: "client",
        password: " Secret 123 ",
      },
    },
  ]);
});

test("avatar upload previews the accepted local bytes without an immediate remote reread", async () => {
  const handlers = new Map();
  const uploads = [];
  let avatarReads = 0;
  const profile = { id: 1, username: "client", avatar: "/api/v1/user/avatar" };
  registerCommercialIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
    },
    client: {
      baseUrl: "https://gateway.test",
      uploadAvatar: async (input) => uploads.push(input),
      currentProfile: async () => profile,
      currentAvatar: async () => {
        avatarReads += 1;
        throw new Error("new object is not readable yet");
      },
    },
    deviceIdentity: {},
    modelAccessStore: {},
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.9",
    isAllowedSender: () => true,
    onAuthenticated: async () => undefined,
    onModelAccessChanged: async () => undefined,
    onLoggedOut: async () => undefined,
  });

  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
  const result = await handlers.get(COMMERCIAL_CHANNELS.uploadAvatar)(
    { sender: { id: 1 } },
    {
      fileName: "avatar.png",
      contentType: "IMAGE/PNG",
      bytes,
    },
  );

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].contentType, "image/png");
  assert.deepEqual(uploads[0].bytes, bytes);
  assert.equal(avatarReads, 0);
  assert.deepEqual(result, {
    profile,
    avatar: {
      contentType: "image/png",
      dataUrl: "data:image/png;base64,iVBORw==",
    },
  });
});

test("missing restored cloud session clears the local workspace session", async () => {
  const handlers = new Map();
  let authenticated = 0;
  let loggedOut = 0;
  registerCommercialIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
    },
    client: {
      baseUrl: "http://122.193.11.199:8889",
      restoreSession: async () => null,
    },
    deviceIdentity: {},
    modelAccessStore: {
      load: async () => ({ schemaVersion: 2, mode: "cloud" }),
    },
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.3",
    isAllowedSender: () => true,
    onAuthenticated: async () => {
      authenticated += 1;
    },
    onModelAccessChanged: async () => undefined,
    onLoggedOut: async () => {
      loggedOut += 1;
    },
  });

  const restoreSession = handlers.get(COMMERCIAL_CHANNELS.session);
  assert.equal(typeof restoreSession, "function");
  assert.equal(await restoreSession({ sender: { id: 1 } }), null);
  assert.equal(authenticated, 0);
  assert.equal(loggedOut, 1);
});

test("restored sessions hydrate the complete cloud model access once", async () => {
  const handlers = new Map();
  const synchronized = [];
  const deviceId = "2217d912-c377-42de-b2eb-759cf172bae2";
  let licenseCalls = 0;
  let catalogCalls = 0;
  registerCommercialIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
    },
    client: {
      baseUrl: "https://gateway.example.test",
      restoreSession: async () => ({
        authenticated: true,
        expiresAtEpochMs: 10_000,
        user,
        tenant,
      }),
      currentLicense: async () => {
        licenseCalls += 1;
        return {
          license: {
            id: "license-1",
            editionType: "PROFESSIONAL",
            allowsCustomModels: true,
          },
          device: { id: deviceId },
          activation: { id: "activation-1" },
          lease: null,
        };
      },
      modelCatalog: async (query, receivedDeviceId) => {
        catalogCalls += 1;
        assert.deepEqual(query, {});
        assert.equal(receivedDeviceId, deviceId);
        return {
          catalogVersion: "catalog-v1",
          items: [
            {
              id: "text-1",
              code: "DEMO_TEXT",
              displayName: "Demo Text",
              operation: "TEXT",
              isDefault: true,
            },
            {
              id: "image-1",
              code: "DEMO_IMAGE",
              displayName: "Demo Image",
              operation: "IMAGE",
              isDefault: true,
            },
            {
              id: "video-1",
              code: "DEMO_VIDEO",
              displayName: "Demo Video",
              operation: "VIDEO",
              isDefault: true,
            },
          ],
        };
      },
    },
    deviceIdentity: {
      summary: async () => ({ publicKeyHash: "public-key-hash" }),
    },
    modelAccessStore: {
      load: async () => ({ schemaVersion: 2, mode: "cloud" }),
    },
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.5",
    isAllowedSender: () => true,
    onAuthenticated: async () => undefined,
    onModelAccessChanged: async (
      _access,
      _allowsCustomModels,
      assignments,
    ) => synchronized.push(assignments),
    onLoggedOut: async () => undefined,
  });

  const restoreSession = handlers.get(COMMERCIAL_CHANNELS.session);
  await restoreSession({ sender: { id: 1 } });
  await restoreSession({ sender: { id: 1 } });

  assert.equal(licenseCalls, 1);
  assert.equal(catalogCalls, 1);
  assert.deepEqual(synchronized.at(-1), [
    { modelId: "DEMO_TEXT", role: "TEXT" },
    { modelId: "DEMO_IMAGE", role: "IMAGE_GENERATION" },
    { modelId: "DEMO_VIDEO", role: "VIDEO_TEXT_TO_VIDEO" },
  ]);
});

test("standard authorization hides persisted BYOK details from the renderer", async () => {
  const handlers = new Map();
  const storedAccess = {
    schemaVersion: 2,
    mode: "byok",
    byokBaseUrl: "https://byok.example/v1",
    byokApiKey: "user-secret",
    byokModelAssignments: [{ modelId: "user-text", role: "TEXT" }],
  };
  registerCommercialIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
    },
    client: {
      baseUrl: "http://122.193.11.199:8889",
      currentLicense: async () => ({
        license: {
          id: "license-1",
          editionType: "STANDARD",
          allowsCustomModels: false,
        },
        device: { id: "device-1" },
        activation: { id: "activation-1" },
        lease: null,
      }),
    },
    deviceIdentity: {
      summary: async () => ({
        publicKey: "public-key",
        publicKeyHash: "public-key-hash",
      }),
    },
    modelAccessStore: {
      load: async () => storedAccess,
      status: () => ({
        mode: "byok",
        byokConfigured: true,
        byokBaseUrl: storedAccess.byokBaseUrl,
        byokApiKeyPreview: "user...cret",
        byokModelAssignments: storedAccess.byokModelAssignments,
      }),
    },
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.3",
    isAllowedSender: () => true,
    onAuthenticated: async () => undefined,
    onModelAccessChanged: async () => undefined,
    onLoggedOut: async () => undefined,
  });

  const currentLicense = handlers.get(COMMERCIAL_CHANNELS.currentLicense);
  const modelAccessStatus = handlers.get(COMMERCIAL_CHANNELS.modelAccessStatus);
  assert.equal(typeof currentLicense, "function");
  assert.equal(typeof modelAccessStatus, "function");
  await currentLicense({ sender: { id: 1 } });
  const status = await modelAccessStatus({ sender: { id: 1 } });

  assert.deepEqual(status, {
    mode: "cloud",
    byokConfigured: false,
    byokBaseUrl: "",
    byokApiKeyPreview: "",
    byokModelAssignments: [],
    allowsCustomModels: false,
    gatewayOrigin: "http://122.193.11.199:8889",
  });
});

test("Bootstrap exposes the selected BYOK catalog instead of cloud SKUs", async (t) => {
  const originalFetch = globalThis.fetch;
  const byokCalls = [];
  globalThis.fetch = async (url, init) => {
    byokCalls.push({ url: String(url), init });
    return Response.json({ data: [{ id: "user-text-model" }] });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const handlers = new Map();
  const synchronized = [];
  const access = {
    schemaVersion: 2,
    mode: "byok",
    byokBaseUrl: "https://byok.example/v1",
    byokApiKey: "user-secret",
    byokModelAssignments: [
      { modelId: "user-text-model", role: "TEXT" },
    ],
  };
  registerCommercialIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
    },
    client: {
      baseUrl: "http://122.193.11.199:8889",
      bootstrap: async () => ({
        softwareAuthorization: {
          license: {
            id: "license-1",
            editionType: "PROFESSIONAL",
            allowsCustomModels: true,
          },
          device: { id: "device-1" },
          activation: { id: "activation-1" },
          lease: null,
        },
        personalQuota: null,
        models: {
          catalogVersion: "cloud-1",
          items: [
            {
              id: "cloud-text",
              code: "cloud/text-standard",
              displayName: "Cloud Text",
              operation: "TEXT",
            },
          ],
        },
        release: null,
        warnings: [],
      }),
    },
    deviceIdentity: {
      summary: async () => ({
        publicKey: "public-key",
        publicKeyHash: "public-key-hash",
      }),
    },
    modelAccessStore: {
      load: async () => access,
      status: () => ({}),
    },
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.3",
    isAllowedSender: () => true,
    onAuthenticated: async () => undefined,
    onModelAccessChanged: async (
      selectedAccess,
      allowsCustomModels,
      cloudModelAssignments,
    ) => {
      synchronized.push({
        selectedAccess,
        allowsCustomModels,
        cloudModelAssignments,
      });
    },
    onLoggedOut: async () => undefined,
  });

  const bootstrap = handlers.get(COMMERCIAL_CHANNELS.bootstrap);
  assert.equal(typeof bootstrap, "function");
  const result = await bootstrap({ sender: { id: 1 } }, {});

  assert.equal(result.models.items.length, 1);
  assert.equal(result.models.items[0].code, "user-text-model");
  assert.equal(result.models.items[0].operation, "TEXT");
  assert.equal(byokCalls.length, 1);
  assert.equal(byokCalls[0].url, "https://byok.example/v1/models");
  assert.equal(
    new Headers(byokCalls[0].init.headers).get("Authorization"),
    "Bearer user-secret",
  );
  assert.deepEqual(synchronized.at(-1).cloudModelAssignments, [
    { modelId: "cloud/text-standard", role: "TEXT" },
  ]);
  assert.equal(synchronized.at(-1).allowsCustomModels, true);
});

test("bootstrap verifies the raw offline lease before projecting it", async () => {
  const handlers = new Map();
  const keyId = "lease-test-v1";
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const payloadJson = JSON.stringify({
    keyId,
    licenseId: "license-1",
    devicePublicKeyHash: "public-key-hash",
    editionType: "PROFESSIONAL",
    allowsCustomModels: true,
  });
  const lease = {
    id: "lease-1",
    expiresAt: "2099-01-01T00:00:00Z",
    keyId,
    payloadJson,
    signature: sign(null, Buffer.from(payloadJson, "utf8"), privateKey).toString(
      "base64",
    ),
  };

  registerCommercialIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
    },
    client: {
      baseUrl: "https://gateway.example.test",
      bootstrap: async () => ({
        softwareAuthorization: {
          license: {
            id: "license-1",
            editionType: "PROFESSIONAL",
            allowsCustomModels: true,
          },
          device: { id: "device-1" },
          activation: { id: "activation-1" },
          lease,
        },
        personalQuota: null,
        models: null,
        release: null,
        warnings: [],
      }),
    },
    deviceIdentity: {
      summary: async () => ({
        publicKey: "public-key",
        publicKeyHash: "public-key-hash",
      }),
    },
    modelAccessStore: {
      load: async () => ({ schemaVersion: 2, mode: "cloud" }),
    },
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.5",
    isAllowedSender: () => true,
    onAuthenticated: async () => undefined,
    onModelAccessChanged: async () => undefined,
    onLoggedOut: async () => undefined,
    leaseSigningKeys: {
      [keyId]: publicKey.export({ type: "spki", format: "pem" }),
    },
    devicePublicKeyHash: "public-key-hash",
  });

  const bootstrap = handlers.get(COMMERCIAL_CHANNELS.bootstrap);
  const result = await bootstrap({ sender: { id: 1 } }, {});

  assert.equal(result.softwareAuthorization.lease.verifiedOffline, true);
  assert.equal("payloadJson" in result.softwareAuthorization.lease, false);
  assert.equal("signature" in result.softwareAuthorization.lease, false);
});

test("video catalog synchronization sends only projected duration capabilities", async () => {
  const handlers = new Map();
  const synchronized = [];
  const catalogDeviceIds = [];
  const deviceId = "2217d912-c377-42de-b2eb-759cf172bae2";
  registerCommercialIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
    },
    client: {
      baseUrl: "https://gateway.example.test",
      currentLicense: async () => ({
        license: {
          id: "license-1",
          editionType: "PROFESSIONAL",
          allowsCustomModels: true,
        },
        device: { id: deviceId },
        activation: { id: "activation-1" },
        lease: null,
      }),
      modelCatalog: async ({ operation }, receivedDeviceId) => {
        catalogDeviceIds.push(receivedDeviceId);
        return (
          operation === "TEXT"
            ? {
                catalogVersion: "catalog-v1",
                items: [
                  {
                    id: "text-1",
                    code: "cloud/text-standard",
                    displayName: "Cloud Text",
                    operation: "TEXT",
                  },
                ],
              }
            : {
                catalogVersion: "catalog-v1",
                items: [
                  {
                    id: "video-1",
                    code: "cloud/video-standard",
                    displayName: "Cloud Video",
                    operation: "VIDEO",
                    capabilityJson: JSON.stringify({
                      supportedModes: ["textToVideo", "firstLastFrame"],
                      referenceAudioMinSeconds: 1.8,
                      referenceAudioMaxSeconds: 15.2,
                      referenceAudioTotalMinSeconds: 2,
                      referenceAudioTotalMaxSeconds: 15.2,
                      referenceVideoMinSeconds: 3,
                      referenceVideoMaxSeconds: 10,
                      referenceVideoTotalMinSeconds: 5,
                      referenceVideoTotalMaxSeconds: 20,
                      providerSecret: "must-not-cross-process-boundary",
                    }),
                  },
                ],
              }
        );
      },
    },
    deviceIdentity: {
      summary: async () => ({ publicKeyHash: "public-key-hash" }),
    },
    modelAccessStore: {
      load: async () => ({ schemaVersion: 2, mode: "cloud" }),
    },
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.3",
    isAllowedSender: () => true,
    onAuthenticated: async () => undefined,
    onModelAccessChanged: async (
      _access,
      _allowsCustomModels,
      cloudModelAssignments,
      modelCapabilities,
    ) => synchronized.push({ cloudModelAssignments, modelCapabilities }),
    onLoggedOut: async () => undefined,
  });

  const modelCatalog = handlers.get(COMMERCIAL_CHANNELS.modelCatalog);
  await modelCatalog({ sender: { id: 1 } }, { operation: "TEXT" });
  await modelCatalog({ sender: { id: 1 } }, { operation: "VIDEO" });

  assert.deepEqual(catalogDeviceIds, [deviceId, deviceId]);
  assert.deepEqual(synchronized.at(-1).cloudModelAssignments, [
    { modelId: "cloud/text-standard", role: "TEXT" },
    { modelId: "cloud/video-standard", role: "VIDEO_TEXT_TO_VIDEO" },
    { modelId: "cloud/video-standard", role: "VIDEO_FIRST_LAST_FRAME" },
  ]);
  assert.deepEqual(synchronized.at(-1).modelCapabilities, [
    {
      modelId: "cloud/video-standard",
      referenceAudioMinSeconds: 1.8,
      referenceAudioMaxSeconds: 15.2,
      referenceAudioTotalMinSeconds: 2,
      referenceAudioTotalMaxSeconds: 15.2,
      referenceVideoMinSeconds: 3,
      referenceVideoMaxSeconds: 10,
      referenceVideoTotalMinSeconds: 5,
      referenceVideoTotalMaxSeconds: 20,
    },
  ]);
  assert.equal(JSON.stringify(synchronized).includes("providerSecret"), false);
});

test("release checks use Electron-owned version, platform, and architecture", async () => {
  const handlers = new Map();
  let receivedQuery = null;
  registerCommercialIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
    },
    client: {
      baseUrl: "http://122.193.11.199:8889",
      checkRelease: async (query) => {
        receivedQuery = query;
        return { available: false, required: false, reason: "up-to-date" };
      },
    },
    deviceIdentity: {},
    modelAccessStore: {},
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.3",
    isAllowedSender: () => true,
    onAuthenticated: async () => undefined,
    onModelAccessChanged: async () => undefined,
    onLoggedOut: async () => undefined,
  });

  const checkRelease = handlers.get(COMMERCIAL_CHANNELS.checkRelease);
  assert.equal(typeof checkRelease, "function");
  const result = await checkRelease(
    { sender: { id: 1 } },
    { currentVersion: "99.0.0", target: "spoofed", arch: "spoofed" },
  );

  assert.deepEqual(receivedQuery, {
    currentVersion: "1.1.3",
    target: "windows",
    arch: "x86_64",
  });
  assert.deepEqual(result, {
    available: false,
    required: false,
    reason: "up-to-date",
  });
});

test("release update commands delegate only the selected artifact id", async () => {
  const handlers = new Map();
  const downloaded = [];
  let installs = 0;
  registerCommercialIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
    },
    client: { baseUrl: "https://gateway.test" },
    deviceIdentity: {},
    modelAccessStore: {},
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.5",
    isAllowedSender: () => true,
    onAuthenticated: async () => undefined,
    onModelAccessChanged: async () => undefined,
    onLoggedOut: async () => undefined,
    releaseUpdater: {
      download: async (artifactId) => {
        downloaded.push(artifactId);
        return { version: "1.1.6" };
      },
      install: () => {
        installs += 1;
      },
    },
  });

  const downloadUpdate = handlers.get(COMMERCIAL_CHANNELS.downloadUpdate);
  const installUpdate = handlers.get(COMMERCIAL_CHANNELS.installUpdate);
  assert.deepEqual(
    await downloadUpdate({ sender: { id: 1 } }, "artifact-1"),
    { version: "1.1.6" },
  );
  await installUpdate({ sender: { id: 1 } });

  assert.deepEqual(downloaded, ["artifact-1"]);
  assert.equal(installs, 1);
});

test("BYOK configuration is normalized and survives encrypted-store reload", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-model-access-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "model-access.bin");
  const first = new EncryptedFileCommercialModelAccessStore(
    filePath,
    passthroughSecureStorage,
  );

  const configured = await first.configureByok({
    baseUrl: "https://models.example.test/openai/",
    apiKey: "user-secret-key",
    modelAssignments: [
      { modelId: "image-model-a", role: "IMAGE_GENERATION" },
    ],
  });
  const second = new EncryptedFileCommercialModelAccessStore(
    filePath,
    passthroughSecureStorage,
  );
  const restored = await second.load();

  assert.equal(configured.mode, "byok");
  assert.equal(restored.byokBaseUrl, "https://models.example.test/openai/v1");
  assert.equal(restored.byokApiKey, "user-secret-key");
  assert.deepEqual(restored.byokModelAssignments, [
    { modelId: "image-model-a", role: "IMAGE_GENERATION" },
  ]);
  assert.deepEqual(second.status(restored), {
    mode: "byok",
    byokConfigured: true,
    byokBaseUrl: "https://models.example.test/openai/v1",
    byokApiKeyPreview: "user...-key",
    byokModelAssignments: [
      { modelId: "image-model-a", role: "IMAGE_GENERATION" },
    ],
  });
});

test("BYOK Base URL rejects embedded credentials and query parameters", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-model-access-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new EncryptedFileCommercialModelAccessStore(
    join(directory, "model-access.bin"),
    passthroughSecureStorage,
  );

  await assert.rejects(
    store.configureByok({
      baseUrl: "https://user:password@models.example.test/v1?token=secret",
      apiKey: "secret",
    }),
    /BYOK Base URL/,
  );
});

test("BYOK model catalog calls only the user endpoint with the user key", async () => {
  const calls = [];
  const catalog = await fetchByokModelCatalog(
    {
      schemaVersion: 2,
      mode: "byok",
      byokBaseUrl: "https://models.example.test/openai/v1",
      byokApiKey: "user-secret-key",
      byokModelAssignments: [
        { modelId: "image-model-a", role: "IMAGE_GENERATION" },
        { modelId: "image-model-a", role: "IMAGE_EDIT" },
      ],
    },
    "IMAGE",
    async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({
        object: "list",
        data: [
          { id: "image-model-b", object: "model" },
          { id: "image-model-a", object: "model" },
        ],
      });
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://models.example.test/openai/v1/models");
  assert.equal(
    new Headers(calls[0].init.headers).get("Authorization"),
    "Bearer user-secret-key",
  );
  assert.deepEqual(
    catalog.items.map((item) => item.code),
    ["image-model-a"],
  );
  assert.equal(catalog.items[0].operation, "IMAGE");
  assert.deepEqual(JSON.parse(catalog.items[0].capabilityJson), {
    supportedModes: ["IMAGE_EDIT", "TEXT_TO_IMAGE"],
  });
  assert.match(catalog.catalogVersion, /^byok-[0-9a-f]{16}$/);
  assert.equal(JSON.stringify(catalog).includes("user-secret-key"), false);
});

test("BYOK model catalog supports a keyless standard endpoint", async () => {
  let authorization = "not-called";
  const catalog = await fetchByokModelCatalog(
    {
      schemaVersion: 2,
      mode: "byok",
      byokBaseUrl: "http://127.0.0.1:11434/v1",
      byokApiKey: "",
      byokModelAssignments: [{ modelId: "local-model", role: "TEXT" }],
    },
    "TEXT",
    async (_url, init) => {
      authorization = new Headers(init.headers).get("Authorization");
      return Response.json({ data: [{ id: "local-model" }] });
    },
  );

  assert.equal(authorization, null);
  assert.equal(catalog.items[0].code, "local-model");
});

test("BYOK video roles expose requested modes without conflating first frame and image reference", async () => {
  const catalog = await fetchByokModelCatalog(
    {
      schemaVersion: 2,
      mode: "byok",
      byokBaseUrl: "https://models.example.test/v1",
      byokApiKey: "key",
      byokModelAssignments: [
        { modelId: "video-model", role: "VIDEO_IMAGE_TO_VIDEO" },
        { modelId: "video-model", role: "VIDEO_IMAGE_REFERENCE" },
      ],
    },
    "VIDEO",
    async () => Response.json({ data: [{ id: "video-model" }] }),
  );

  assert.deepEqual(JSON.parse(catalog.items[0].capabilityJson), {
    supportedModes: ["FIRST_FRAME", "IMAGE_REFERENCE", "IMAGE_TO_VIDEO"],
  });
});

test("BYOK catalog operation filters assignments instead of relabeling models", async () => {
  let called = false;
  const catalog = await fetchByokModelCatalog(
    {
      schemaVersion: 2,
      mode: "byok",
      byokBaseUrl: "https://models.example.test/v1",
      byokApiKey: "secret",
      byokModelAssignments: [
        { modelId: "image-only", role: "IMAGE_GENERATION" },
      ],
    },
    "VIDEO",
    async () => {
      called = true;
      return Response.json({ data: [{ id: "image-only" }] });
    },
  );

  assert.equal(called, false);
  assert.deepEqual(catalog.items, []);
});

test("local model proxy authenticates callers and strips credential authority", async (t) => {
  const calls = [];
  const client = {
    async modelRequest(input) {
      calls.push(input);
      return Response.json({ ok: true });
    },
  };
  const device = {
    async summary() {
      return {
        schemaVersion: 1,
        publicKey: "public-key",
        publicKeyHash: "device-public-key-hash",
      };
    },
  };
  const proxy = new CommercialModelProxy(client, device);
  await proxy.start();
  t.after(() => proxy.stop());

  const unauthenticated = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "cloud-text-standard", messages: [] }),
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(calls.length, 0);

  const forbidden = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "cloud-text-standard",
      api_key: "must-not-cross-proxy",
    }),
  });
  assert.equal(forbidden.status, 400);
  assert.equal(calls.length, 0);

  const forbiddenMultipartBody = new FormData();
  forbiddenMultipartBody.append("model", "cloud-image-standard");
  forbiddenMultipartBody.append("base-url", "https://bypass.example/v1");
  const forbiddenMultipart = await fetch(`${proxy.baseUrl}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${proxy.token}` },
    body: forbiddenMultipartBody,
  });
  assert.equal(forbiddenMultipart.status, 400);
  assert.equal(calls.length, 0);

  const accepted = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "operation-1",
    },
    body: JSON.stringify({ model: "cloud-text-standard", messages: [] }),
  });
  assert.equal(accepted.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/v1/chat/completions");
  assert.equal(calls[0].devicePublicKeyHash, "device-public-key-hash");
  assert.equal(new Headers(calls[0].headers).get("Authorization"), null);
  assert.equal(
    new Headers(calls[0].headers).get("Idempotency-Key"),
    "operation-1",
  );
});

test("local model proxy forwards multipart, Anthropic, and Range protocol data", async (t) => {
  const calls = [];
  const client = {
    async modelRequest(input) {
      calls.push(input);
      if (input.path.endsWith("/content")) {
        return new Response(Buffer.from("partial-video"), {
          status: 206,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Range": "bytes 0-12/200",
            "Content-Disposition": 'attachment; filename="video.mp4"',
            "Content-Type": "video/mp4",
          },
        });
      }
      return Response.json({ ok: true });
    },
  };
  const device = {
    async summary() {
      return {
        schemaVersion: 1,
        publicKey: "public-key",
        publicKeyHash: "device-public-key-hash",
      };
    },
  };
  const proxy = new CommercialModelProxy(client, device);
  await proxy.start();
  t.after(() => proxy.stop());

  const imageEdit = new FormData();
  imageEdit.append("model", "cloud-image-standard");
  imageEdit.append("prompt", "edit");
  imageEdit.append("image", new Blob(["image-bytes"], { type: "image/png" }), "input.png");
  const multipartResponse = await fetch(`${proxy.baseUrl}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${proxy.token}` },
    body: imageEdit,
  });
  assert.equal(multipartResponse.status, 200);
  assert.equal(Buffer.isBuffer(calls[0].body), true);
  assert.match(
    new Headers(calls[0].headers).get("Content-Type"),
    /^multipart\/form-data; boundary=/,
  );

  const anthropicResponse = await fetch(`${proxy.baseUrl}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({ model: "cloud-text-standard", messages: [] }),
  });
  assert.equal(anthropicResponse.status, 200);
  assert.equal(
    new Headers(calls[1].headers).get("Anthropic-Version"),
    "2023-06-01",
  );
  assert.equal(
    new Headers(calls[1].headers).get("Anthropic-Beta"),
    "prompt-caching-2024-07-31",
  );

  const rangeResponse = await fetch(`${proxy.baseUrl}/videos/video-1/content`, {
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      Range: "bytes=0-12",
    },
  });
  assert.equal(rangeResponse.status, 206);
  assert.equal(new Headers(calls[2].headers).get("Range"), "bytes=0-12");
  assert.equal(rangeResponse.headers.get("accept-ranges"), "bytes");
  assert.equal(rangeResponse.headers.get("content-range"), "bytes 0-12/200");
  assert.equal(
    rangeResponse.headers.get("content-disposition"),
    'attachment; filename="video.mp4"',
  );
});

test("local model proxy rejects HTML returned by the video content endpoint", async (t) => {
  const client = {
    async modelRequest() {
      return new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
  };
  const device = {
    async summary() {
      return {
        schemaVersion: 1,
        publicKey: "public-key",
        publicKeyHash: "device-public-key-hash",
      };
    },
  };
  const proxy = new CommercialModelProxy(client, device);
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/videos/video-html/content`, {
    headers: { Authorization: `Bearer ${proxy.token}` },
  });

  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.match(payload.error.message, /返回了非视频内容：text\/html/);
});

test("local model proxy aborts an upstream stream when the local client disconnects", async (t) => {
  let upstreamSignal;
  let resolveAborted;
  const aborted = new Promise((resolve) => {
    resolveAborted = resolve;
  });
  const client = {
    async modelRequest(input) {
      upstreamSignal = input.signal;
      input.signal.addEventListener("abort", resolveAborted, { once: true });
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: first\n\n"));
        },
      });
      return new Response(body, {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  };
  const device = {
    async summary() {
      return {
        schemaVersion: 1,
        publicKey: "public-key",
        publicKeyHash: "device-public-key-hash",
      };
    },
  };
  const proxy = new CommercialModelProxy(client, device);
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "cloud-text-standard",
      messages: [],
      stream: true,
    }),
  });
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), "data: first\n\n");
  await reader.cancel();
  await Promise.race([
    aborted,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("upstream stream was not aborted")), 2_000),
    ),
  ]);

  assert.equal(upstreamSignal.aborted, true);
});

test("cloud model writes inject JWT, device ID, and one idempotency key", async () => {
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://aianime.122-193-11-199.sslip.io",
    accessToken: "old-client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user,
    tenant,
  };
  const calls = [];
  let modelAttempts = 0;
  const client = new CommercialApiClient({
    baseUrl: "https://aianime.122-193-11-199.sslip.io",
    sessionStore: store,
    fetchImpl: async (url, init) => {
      const call = { url: String(url), init };
      calls.push(call);
      if (call.url.includes("/api/v1/client/licenses/current")) {
        return Response.json({ device: { id: "device-42" } });
      }
      if (call.url.endsWith("/api/v1/client/auth/refresh")) {
        return Response.json({ accessToken: "new-client-jwt", expiresIn: 3600 });
      }
      if (call.url.endsWith("/v1/chat/completions")) {
        modelAttempts += 1;
        return modelAttempts === 1
          ? Response.json({ error: "expired" }, { status: 401 })
          : Response.json({ ok: true });
      }
      throw new Error(`unexpected request ${call.url}`);
    },
  });

  const response = await client.modelRequest({
    method: "POST",
    path: "/v1/chat/completions",
    headers: {
      Authorization: "Bearer renderer-bypass",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "cloud-text-standard", messages: [] }),
    devicePublicKeyHash: "device-public-key-hash",
  });

  assert.equal(response.status, 200);
  const modelCalls = calls.filter((call) => call.url.endsWith("/v1/chat/completions"));
  assert.equal(modelCalls.length, 2);
  const firstHeaders = new Headers(modelCalls[0].init.headers);
  const secondHeaders = new Headers(modelCalls[1].init.headers);
  assert.equal(firstHeaders.get("Authorization"), "Bearer old-client-jwt");
  assert.equal(secondHeaders.get("Authorization"), "Bearer new-client-jwt");
  assert.equal(firstHeaders.get("X-Device-Id"), "device-42");
  assert.equal(secondHeaders.get("X-Device-Id"), "device-42");
  assert.match(firstHeaders.get("Idempotency-Key"), /^[0-9a-f-]{36}$/);
  assert.equal(
    secondHeaders.get("Idempotency-Key"),
    firstHeaders.get("Idempotency-Key"),
  );
});

test("cloud model transport validates protocol-specific request headers", async () => {
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://aianime.122-193-11-199.sslip.io",
    accessToken: "client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user,
    tenant,
  };
  const calls = [];
  const client = new CommercialApiClient({
    baseUrl: "https://aianime.122-193-11-199.sslip.io",
    sessionStore: store,
    fetchImpl: async (url, init) => {
      const call = { url: String(url), init };
      calls.push(call);
      if (call.url.includes("/api/v1/client/licenses/current")) {
        return Response.json({ device: { id: "device-42" } });
      }
      return Response.json({ ok: true });
    },
  });

  await client.modelRequest({
    method: "POST",
    path: "/v1/messages",
    headers: {
      "Content-Type": "application/json",
      "Anthropic-Version": "2023-06-01",
      "Anthropic-Beta": "prompt-caching-2024-07-31",
    },
    body: Buffer.from(JSON.stringify({ model: "cloud-text-standard", messages: [] })),
    devicePublicKeyHash: "device-public-key-hash",
  });
  await client.modelRequest({
    method: "GET",
    path: "/v1/videos/video-1/content",
    headers: { Range: "bytes=0-1023" },
    devicePublicKeyHash: "device-public-key-hash",
  });

  const messageCall = calls.find((call) => call.url.endsWith("/v1/messages"));
  const messageHeaders = new Headers(messageCall.init.headers);
  assert.equal(messageHeaders.get("Anthropic-Version"), "2023-06-01");
  assert.equal(
    messageHeaders.get("Anthropic-Beta"),
    "prompt-caching-2024-07-31",
  );
  const contentCall = calls.find((call) => call.url.endsWith("/content"));
  assert.equal(new Headers(contentCall.init.headers).get("Range"), "bytes=0-1023");

  await assert.rejects(
    client.modelRequest({
      method: "POST",
      path: "/v1/messages",
      headers: { "Anthropic-Version": "invalid" },
      body: Buffer.from("{}"),
      devicePublicKeyHash: "device-public-key-hash",
    }),
    /anthropic-version/,
  );
  await assert.rejects(
    client.modelRequest({
      method: "POST",
      path: "/v1/chat/completions",
      headers: { Range: "bytes=0-10" },
      body: Buffer.from("{}"),
      devicePublicKeyHash: "device-public-key-hash",
    }),
    /Range/,
  );
});

test("cloud model requests reject absolute URLs and credential query parameters", async () => {
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://aianime.122-193-11-199.sslip.io",
    accessToken: "client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user,
    tenant,
  };
  const client = new CommercialApiClient({
    baseUrl: "https://aianime.122-193-11-199.sslip.io",
    sessionStore: store,
    fetchImpl: async () => Response.json({ ok: true }),
  });

  await assert.rejects(
    client.modelRequest({
      method: "GET",
      path: "https://bypass.example/v1/models",
      devicePublicKeyHash: "device-public-key-hash",
    }),
    CommercialApiError,
  );
  await assert.rejects(
    client.modelRequest({
      method: "GET",
      path: "/v1/models?api_key=bypass-secret",
      devicePublicKeyHash: "device-public-key-hash",
    }),
    /禁止查询参数/,
  );
  await assert.rejects(
    client.modelRequest({
      method: "GET",
      path: "/v1beta/models?key=gemini-bypass-secret",
      devicePublicKeyHash: "device-public-key-hash",
    }),
    /禁止查询参数/,
  );
});
