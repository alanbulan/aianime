import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  BYOK_MODEL_ROLES,
  EncryptedFileCommercialModelAccessStore,
  fetchByokModelCatalog,
  fetchByokProviderModelIds,
} from "../src/commercial-model-access.ts";
import {
  CommercialModelProxy,
  modelRoutingSnapshot,
} from "../src/commercial-model-proxy.ts";
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

test("model roles omit operations without an application call chain", () => {
  assert.equal(BYOK_MODEL_ROLES.includes("RERANK"), false);
  assert.equal(BYOK_MODEL_ROLES.includes("MODERATION"), false);
});

const passthroughSecureStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value, "utf8"),
  decryptString: (value) => value.toString("utf8"),
};

function configureCloudProxy(proxy, assignments) {
  proxy.configureRouting({
    allowsCustomModels: false,
    cloudModelAssignments: assignments.map(({ modelId, role }) => ({
      modelId,
      role,
      priority: 100,
      enabled: true,
    })),
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [],
    },
  });
}

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
      load: async () => ({
        schemaVersion: 4,
        cloudModelAssignments: [],
        byokProviders: [],
      }),
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
              capabilityJson: JSON.stringify({
                supportedModes: ["TEXT_TO_IMAGE", "IMAGE_TO_IMAGE"],
              }),
              isDefault: true,
            },
            {
              id: "video-1",
              code: "DEMO_VIDEO",
              displayName: "Demo Video",
              operation: "VIDEO",
              isDefault: true,
            },
            {
              id: "speech-1",
              code: "MOSS_TTSD_V0_5",
              displayName: "MOSS-TTSD v0.5",
              operation: "AUDIO_VOICE_CLONE",
              capabilityJson: JSON.stringify({
                supportedModes: ["SPEECH", "VOICE_CLONE"],
              }),
              isDefault: true,
            },
            {
              id: "music-1",
              code: "DEMO_MUSIC",
              displayName: "Demo Music",
              operation: "AUDIO_MUSIC",
              capabilityJson: JSON.stringify({ supportedModes: ["MUSIC"] }),
              isDefault: true,
            },
            {
              id: "voice-design-1",
              code: "QWEN3_TTS_VD_2026_01_26",
              displayName: "Qwen3 TTS Voice Design",
              operation: "AUDIO_VOICE_DESIGN",
              capabilityJson: JSON.stringify({
                supportedModes: ["VOICE_DESIGN"],
              }),
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
      load: async () => ({
        schemaVersion: 4,
        cloudModelAssignments: [],
        byokProviders: [],
      }),
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
    { modelId: "DEMO_TEXT", role: "TEXT", priority: 100, enabled: true },
    {
      modelId: "DEMO_IMAGE",
      role: "IMAGE_GENERATION",
      priority: 100,
      enabled: true,
    },
    {
      modelId: "DEMO_IMAGE",
      role: "IMAGE_EDIT",
      priority: 100,
      enabled: true,
    },
    {
      modelId: "DEMO_VIDEO",
      role: "VIDEO_TEXT_TO_VIDEO",
      priority: 100,
      enabled: true,
    },
    {
      modelId: "MOSS_TTSD_V0_5",
      role: "AUDIO_SPEECH",
      priority: 100,
      enabled: true,
    },
    {
      modelId: "MOSS_TTSD_V0_5",
      role: "AUDIO_VOICE_CLONE",
      priority: 100,
      enabled: true,
    },
    {
      modelId: "QWEN3_TTS_VD_2026_01_26",
      role: "AUDIO_VOICE_DESIGN",
      priority: 100,
      enabled: true,
    },
    {
      modelId: "DEMO_MUSIC",
      role: "AUDIO_MUSIC",
      priority: 100,
      enabled: true,
    },
  ]);
});

test("standard authorization hides persisted BYOK details from the renderer", async () => {
  const handlers = new Map();
  const storedAccess = {
    schemaVersion: 4,
    cloudModelAssignments: [],
    byokProviders: [
      {
        id: "provider-one",
        name: "Provider One",
        baseUrl: "https://byok.example/v1",
        apiKey: "user-secret",
        enabled: true,
        priority: 10,
        modelAssignments: [
          { modelId: "user-text", role: "TEXT", priority: 10, enabled: true },
        ],
      },
    ],
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
        mode: "mixed",
        byokConfigured: true,
        cloudModelAssignments: [],
        byokProviders: [
          {
            id: "provider-one",
            name: "Provider One",
            baseUrl: "https://byok.example/v1",
            apiKeyPreview: "user...cret",
            configured: true,
            enabled: true,
            priority: 10,
            modelAssignments: storedAccess.byokProviders[0].modelAssignments,
          },
        ],
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
    mode: "mixed",
    byokConfigured: false,
    byokProviders: [],
    cloudModelAssignments: [],
    allowsCustomModels: false,
    gatewayOrigin: "http://122.193.11.199:8889",
  });
});

test("Bootstrap merges configured BYOK models with cloud SKUs", async () => {
  const handlers = new Map();
  const synchronized = [];
  const access = {
    schemaVersion: 4,
    cloudModelAssignments: [],
    byokProviders: [
      {
        id: "provider-one",
        name: "Provider One",
        baseUrl: "https://byok.example/v1",
        apiKey: "user-secret",
        enabled: true,
        priority: 20,
        modelAssignments: [
          {
            modelId: "user-text-model",
            role: "TEXT",
            priority: 20,
            enabled: true,
          },
        ],
      },
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

  assert.deepEqual(
    result.models.items.map((item) => item.code),
    ["cloud/text-standard", "user-text-model"],
  );
  assert.equal(result.models.items[1].operation, "TEXT");
  assert.deepEqual(synchronized.at(-1).cloudModelAssignments, [
    {
      modelId: "cloud/text-standard",
      role: "TEXT",
      priority: 100,
      enabled: true,
    },
  ]);
  assert.equal(synchronized.at(-1).allowsCustomModels, true);
});

test("explicit cloud catalog requests do not reuse the active BYOK catalog", async () => {
  const handlers = new Map();
  let cloudCatalogCalls = 0;
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
        device: { id: "device-1" },
        activation: { id: "activation-1" },
        lease: null,
      }),
      modelCatalog: async () => {
        cloudCatalogCalls += 1;
        return {
          catalogVersion: "cloud-v1",
          items: [
            {
              id: "cloud-text",
              code: "cloud-text",
              displayName: "Cloud text",
              operation: "TEXT",
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
      load: async () => ({
        schemaVersion: 3,
        mode: "byok",
        cloudModelAssignments: [],
        byokBaseUrl: "https://byok.example/v1",
        byokApiKey: "secret",
        byokModelAssignments: [{ modelId: "byok-text", role: "TEXT" }],
      }),
    },
    deviceName: "DESKTOP-01",
    platform: "windows",
    arch: "x86_64",
    clientVersion: "1.1.12",
    isAllowedSender: () => true,
    onAuthenticated: async () => undefined,
    onModelAccessChanged: async () => undefined,
    onLoggedOut: async () => undefined,
  });

  const result = await handlers.get(COMMERCIAL_CHANNELS.modelCatalog)(
    { sender: { id: 1 } },
    { source: "cloud" },
  );

  assert.equal(cloudCatalogCalls, 1);
  assert.equal(result.items[0].code, "cloud-text");
});

test("cloud model catalog remains available when local BYOK storage cannot load", async () => {
  const handlers = new Map();
  const synchronized = [];
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
        device: { id: "device-1" },
        activation: { id: "activation-1" },
        lease: null,
      }),
      modelCatalog: async () => ({
        catalogVersion: "cloud-v1",
        items: [
          {
            id: "cloud-image",
            code: "cloud-image",
            displayName: "Cloud image",
            operation: "IMAGE",
            isDefault: true,
          },
        ],
      }),
    },
    deviceIdentity: {
      summary: async () => ({ publicKeyHash: "public-key-hash" }),
    },
    modelAccessStore: {
      load: async () => {
        throw new Error("safeStorage is unavailable");
      },
    },
    deviceName: "MAC-01",
    platform: "darwin",
    arch: "arm64",
    clientVersion: "1.1.56",
    isAllowedSender: () => true,
    onAuthenticated: async () => undefined,
    onModelAccessChanged: async (access, _allowsByok, assignments) => {
      synchronized.push({ access, assignments });
    },
    onLoggedOut: async () => undefined,
  });

  const result = await handlers.get(COMMERCIAL_CHANNELS.modelCatalog)(
    { sender: { id: 1 } },
    { operation: "IMAGE" },
  );

  assert.deepEqual(result.items.map((item) => item.code), ["cloud-image"]);
  assert.deepEqual(synchronized.at(-1), {
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [],
    },
    assignments: [
      {
        modelId: "cloud-image",
        role: "IMAGE_GENERATION",
        priority: 100,
        enabled: true,
      },
    ],
  });
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
      load: async () => ({
        schemaVersion: 4,
        cloudModelAssignments: [],
        byokProviders: [],
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
        return operation === "TEXT"
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
          : operation === "VIDEO"
            ? {
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
                      referenceAudioItemMaxDuration: 15.2,
                      referenceAudioTotalMinSeconds: 2,
                      referenceAudioTotalMaxDuration: 15.2,
                      referenceVideoMinSeconds: 3,
                      referenceVideoItemMaxDuration: 10,
                      referenceVideoTotalMinSeconds: 5,
                      referenceVideoTotalMaxDuration: 20,
                      providerSecret: "must-not-cross-process-boundary",
                    }),
                  },
                ],
              }
            : {
                catalogVersion: "catalog-v1",
                items: [
                  {
                    id: `${operation.toLowerCase()}-1`,
                    code: `cloud/${operation.toLowerCase()}-standard`,
                    displayName: `Cloud ${operation}`,
                    operation,
                  },
                ],
              };
      },
    },
    deviceIdentity: {
      summary: async () => ({ publicKeyHash: "public-key-hash" }),
    },
    modelAccessStore: {
      load: async () => ({
        schemaVersion: 4,
        cloudModelAssignments: [],
        byokProviders: [],
      }),
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
    {
      modelId: "cloud/text-standard",
      role: "TEXT",
      priority: 100,
      enabled: true,
    },
    {
      modelId: "cloud/video-standard",
      role: "VIDEO_TEXT_TO_VIDEO",
      priority: 100,
      enabled: true,
    },
    {
      modelId: "cloud/video-standard",
      role: "VIDEO_FIRST_LAST_FRAME",
      priority: 100,
      enabled: true,
    },
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
    providerId: "provider-one",
    name: "Provider One",
    baseUrl: "https://models.example.test/openai/",
    apiKey: "user-secret-key",
    priority: 25,
    modelAssignments: [
      {
        modelId: "image-model-a",
        role: "IMAGE_GENERATION",
        priority: 30,
        enabled: true,
      },
    ],
  });
  const second = new EncryptedFileCommercialModelAccessStore(
    filePath,
    passthroughSecureStorage,
  );
  const restored = await second.load();

  assert.equal(configured.schemaVersion, 5);
  assert.equal(restored.byokProviders[0].baseUrl, "https://models.example.test/openai/v1");
  assert.equal(restored.byokProviders[0].apiKey, "user-secret-key");
  assert.deepEqual(restored.byokProviders[0].modelAssignments, [
    {
      modelId: "image-model-a",
      role: "IMAGE_GENERATION",
      priority: 30,
      enabled: true,
    },
  ]);
  assert.deepEqual(second.status(restored), {
    mode: "mixed",
    byokConfigured: true,
    cloudModelAssignments: [],
    byokProviders: [
      {
        id: "provider-one",
        name: "Provider One",
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "https://models.example.test/openai/v1",
        apiKeyPreview: "user...-key",
        configured: true,
        enabled: true,
        priority: 25,
        modelAssignments: [
          {
            modelId: "image-model-a",
            role: "IMAGE_GENERATION",
            priority: 30,
            enabled: true,
          },
        ],
      },
    ],
  });
});

test("cloud model selections survive configuring and clearing BYOK providers", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-model-access-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "model-access.bin");
  const store = new EncryptedFileCommercialModelAccessStore(
    filePath,
    passthroughSecureStorage,
  );
  const cloudAssignments = [
    { modelId: "cloud-text", role: "TEXT", priority: 10, enabled: true },
  ];

  await store.selectCloud(cloudAssignments);
  await store.configureByok({
    providerId: "provider-one",
    baseUrl: "https://models.example.test/v1",
    apiKey: "byok-secret",
    modelAssignments: [
      { modelId: "byok-text", role: "TEXT", priority: 20, enabled: true },
    ],
  });
  const cleared = await store.clearByok("provider-one");

  assert.equal(cleared.schemaVersion, 5);
  assert.deepEqual(cleared.byokProviders, []);
  assert.deepEqual(cleared.cloudModelAssignments, cloudAssignments);
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

test("BYOK provider model list calls only the selected endpoint with its key", async () => {
  const calls = [];
  const result = await fetchByokProviderModelIds(
    {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "provider-one",
          name: "Provider One",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: "https://models.example.test/openai/v1",
          apiKey: "user-secret-key",
          enabled: true,
          priority: 10,
          modelAssignments: [],
        },
      ],
    },
    "provider-one",
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
    result.models,
    ["image-model-a", "image-model-b"],
  );
  assert.match(result.catalogVersion, /^byok-[0-9a-f]{16}$/);
  assert.equal(JSON.stringify(result).includes("user-secret-key"), false);
});

test("BYOK model discovery accepts an unsaved provider form without persisting it", async () => {
  const access = {
    schemaVersion: 5,
    cloudModelAssignments: [],
    byokProviders: [],
  };
  const calls = [];

  const result = await fetchByokProviderModelIds(
    access,
    {
      providerId: "provider-draft",
      name: "Draft Provider",
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "https://draft.example.test",
      apiKey: "draft-secret",
    },
    async (url, init) => {
      calls.push({ url: String(url), headers: new Headers(init.headers) });
      return Response.json({ data: [{ id: "draft-model" }] });
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://draft.example.test/v1/models");
  assert.equal(calls[0].headers.get("Authorization"), "Bearer draft-secret");
  assert.deepEqual(result.models, ["draft-model"]);
  assert.equal(result.providerId, "provider-draft");
  assert.deepEqual(access.byokProviders, []);
});

test("BYOK model catalog supports a keyless standard endpoint", async () => {
  let authorization = "not-called";
  const result = await fetchByokProviderModelIds(
    {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "local",
          name: "Local",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "",
          enabled: true,
          priority: 10,
          modelAssignments: [],
        },
      ],
    },
    "local",
    async (_url, init) => {
      authorization = new Headers(init.headers).get("Authorization");
      return Response.json({ data: [{ id: "local-model" }] });
    },
  );

  assert.equal(authorization, null);
  assert.deepEqual(result.models, ["local-model"]);
});

test("BYOK model discovery uses native Anthropic and Gemini protocols", async () => {
  const calls = [];
  const access = {
    schemaVersion: 5,
    cloudModelAssignments: [],
    byokProviders: [
      {
        id: "anthropic",
        name: "Anthropic",
        protocol: "ANTHROPIC",
        baseUrl: "https://api.anthropic.test/v1",
        apiKey: "anthropic-key",
        enabled: true,
        priority: 10,
        modelAssignments: [],
      },
      {
        id: "gemini",
        name: "Gemini",
        protocol: "GEMINI",
        baseUrl: "https://generativelanguage.test/v1beta",
        apiKey: "gemini-key",
        enabled: true,
        priority: 20,
        modelAssignments: [],
      },
    ],
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init.headers) });
    return String(url).includes("anthropic")
      ? Response.json({ data: [{ id: "claude-sonnet" }] })
      : Response.json({ models: [{ name: "models/gemini-2.5-pro" }] });
  };

  const anthropic = await fetchByokProviderModelIds(
    access,
    "anthropic",
    fetchImpl,
  );
  const gemini = await fetchByokProviderModelIds(access, "gemini", fetchImpl);

  assert.deepEqual(anthropic.models, ["claude-sonnet"]);
  assert.deepEqual(gemini.models, ["gemini-2.5-pro"]);
  assert.equal(calls[0].url, "https://api.anthropic.test/v1/models");
  assert.equal(calls[0].headers.get("X-Api-Key"), "anthropic-key");
  assert.equal(calls[0].headers.get("Anthropic-Version"), "2023-06-01");
  assert.equal(
    calls[1].url,
    "https://generativelanguage.test/v1beta/models?pageSize=1000",
  );
  assert.equal(calls[1].headers.get("X-Goog-Api-Key"), "gemini-key");
});

test("native BYOK protocols reject non-text role assignments", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-model-access-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new EncryptedFileCommercialModelAccessStore(
    join(directory, "model-access.bin"),
    passthroughSecureStorage,
  );

  await assert.rejects(
    store.configureByok({
      providerId: "anthropic",
      protocol: "ANTHROPIC",
      baseUrl: "https://api.anthropic.com",
      apiKey: "secret",
      modelAssignments: [
        {
          modelId: "claude-sonnet",
          role: "IMAGE_GENERATION",
          priority: 10,
          enabled: true,
        },
      ],
    }),
    /仅支持文本模型用途/,
  );
});

test("BYOK video roles expose requested modes without conflating first frame and image reference", async () => {
  const catalog = await fetchByokModelCatalog(
    {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "provider-one",
          name: "Provider One",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: "https://models.example.test/v1",
          apiKey: "key",
          enabled: true,
          priority: 10,
          modelAssignments: [
            {
              modelId: "video-model",
              role: "VIDEO_IMAGE_TO_VIDEO",
              priority: 10,
              enabled: true,
            },
            {
              modelId: "video-model",
              role: "VIDEO_IMAGE_REFERENCE",
              priority: 10,
              enabled: true,
            },
          ],
        },
      ],
    },
    "VIDEO",
  );

  assert.deepEqual(JSON.parse(catalog.items[0].capabilityJson), {
    supportedModes: ["FIRST_FRAME", "IMAGE_REFERENCE", "IMAGE_TO_VIDEO"],
    routeSelector: "byok:provider-one:video-model",
  });
});

test("BYOK catalog uses the same canonical image and audio operations as cloud", async () => {
  const catalog = await fetchByokModelCatalog({
    schemaVersion: 5,
    cloudModelAssignments: [],
    byokProviders: [
      {
        id: "provider-one",
        name: "Provider One",
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "https://models.example.test/v1",
        apiKey: "key",
        enabled: true,
        priority: 10,
        modelAssignments: [
          { modelId: "image-edit", role: "IMAGE_EDIT", priority: 10, enabled: true },
          { modelId: "speech", role: "AUDIO_SPEECH", priority: 10, enabled: true },
          { modelId: "clone", role: "AUDIO_VOICE_CLONE", priority: 10, enabled: true },
          { modelId: "music", role: "AUDIO_MUSIC", priority: 10, enabled: true },
        ],
      },
    ],
  });

  assert.deepEqual(
    catalog.items.map((item) => ({
      code: item.code,
      operation: item.operation,
      modes: JSON.parse(item.capabilityJson).supportedModes,
    })),
    [
      {
        code: "music",
        operation: "AUDIO_MUSIC",
        modes: ["MUSIC"],
      },
      {
        code: "clone",
        operation: "AUDIO_VOICE_CLONE",
        modes: ["VOICE_CLONE"],
      },
      {
        code: "speech",
        operation: "AUDIO_VOICE_CLONE",
        modes: ["SPEECH"],
      },
      {
        code: "image-edit",
        operation: "IMAGE",
        modes: ["IMAGE_TO_IMAGE"],
      },
    ],
  );
});

test("BYOK catalog operation filters assignments instead of relabeling models", async () => {
  let called = false;
  const catalog = await fetchByokModelCatalog(
    {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "provider-one",
          name: "Provider One",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: "https://models.example.test/v1",
          apiKey: "secret",
          enabled: true,
          priority: 10,
          modelAssignments: [
            {
              modelId: "image-only",
              role: "IMAGE_GENERATION",
              priority: 10,
              enabled: true,
            },
          ],
        },
      ],
    },
    "VIDEO",
  );

  assert.equal(called, false);
  assert.deepEqual(catalog.items, []);
});

test("global model priority outranks the model id carried by a task", async (t) => {
  const providerCalls = [];
  const providerServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    providerCalls.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ choices: [{ message: { content: "BYOK" } }] }));
  });
  await new Promise((resolve, reject) => {
    providerServer.once("error", reject);
    providerServer.listen(0, "127.0.0.1", () => {
      providerServer.off("error", reject);
      resolve();
    });
  });
  t.after(() => new Promise((resolve) => providerServer.close(resolve)));
  const address = providerServer.address();
  assert.ok(address && typeof address !== "string");

  const cloudCalls = [];
  const routing = {
    allowsCustomModels: true,
    cloudModelAssignments: [
      { modelId: "cloud-text", role: "TEXT", priority: 100, enabled: true },
    ],
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "byok-first",
          name: "BYOK First",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          apiKey: "byok-key",
          enabled: true,
          priority: 10,
          modelAssignments: [
            { modelId: "byok-text", role: "TEXT", priority: 1, enabled: true },
          ],
        },
      ],
    },
  };
  const proxy = new CommercialModelProxy(
    {
      async modelRequest(input) {
        cloudCalls.push(input);
        return Response.json({ choices: [{ message: { content: "cloud" } }] });
      },
    },
    {
      async summary() {
        return {
          schemaVersion: 1,
          publicKey: "public-key",
          publicKeyHash: "device-public-key-hash",
        };
      },
    },
  );
  proxy.configureRouting(routing);
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "cloud-text", messages: [] }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ai-anime-route-source"), "byok");
  assert.equal(response.headers.get("x-ai-anime-route-model"), "byok-text");
  assert.equal(response.headers.get("x-ai-anime-route-role"), "TEXT");
  assert.equal(response.headers.get("x-ai-anime-route-attempts"), "1");
  assert.equal((await response.json()).choices[0].message.content, "BYOK");
  assert.deepEqual(providerCalls.map((call) => call.model), ["byok-text"]);
  assert.equal(cloudCalls.length, 0);
  assert.deepEqual(
    modelRoutingSnapshot(routing).filter((item) => item.role === "TEXT"),
    [
      { modelId: "byok-text", role: "TEXT", priority: 1, enabled: true },
      { modelId: "cloud-text", role: "TEXT", priority: 2, enabled: true },
    ],
  );
});

test("BYOK authentication errors stay visible and never spend the cloud fallback", async (t) => {
  const providerServer = createServer((_request, response) => {
    response.statusCode = 401;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: { message: "invalid BYOK key" } }));
  });
  await new Promise((resolve, reject) => {
    providerServer.once("error", reject);
    providerServer.listen(0, "127.0.0.1", () => {
      providerServer.off("error", reject);
      resolve();
    });
  });
  t.after(() => new Promise((resolve) => providerServer.close(resolve)));
  const address = providerServer.address();
  assert.ok(address && typeof address !== "string");

  const cloudCalls = [];
  const audit = [];
  const proxy = new CommercialModelProxy(
    {
      async modelRequest(input) {
        cloudCalls.push(input);
        return Response.json({ choices: [{ message: { content: "cloud" } }] });
      },
    },
    {
      async summary() {
        return { publicKeyHash: "device-public-key-hash" };
      },
    },
    (entry) => audit.push(entry),
  );
  proxy.configureRouting({
    allowsCustomModels: true,
    cloudModelAssignments: [
      { modelId: "cloud-text", role: "TEXT", priority: 100, enabled: true },
    ],
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "byok-first",
          name: "BYOK First",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          apiKey: "invalid-key",
          enabled: true,
          priority: 100,
          modelAssignments: [
            { modelId: "byok-text", role: "TEXT", priority: 1, enabled: true },
          ],
        },
      ],
    },
  });
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "cloud-text", messages: [] }),
  });

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("x-ai-anime-route-source"), "byok");
  assert.equal(cloudCalls.length, 0);
  assert.ok(
    audit.some(
      (entry) =>
        entry.event === "route_attempt" &&
        entry.source === "byok" &&
        entry.status === 401 &&
        entry.outcome === "rejected" &&
        entry.error === "invalid BYOK key",
    ),
  );
});

test("mixed model proxy rejects calls that cannot enter a configured role", async (t) => {
  const proxy = new CommercialModelProxy(
    { async modelRequest() { return Response.json({}); } },
    { async summary() { return { publicKeyHash: "hash" }; } },
  );
  proxy.configureRouting({
    allowsCustomModels: false,
    cloudModelAssignments: [],
    access: { schemaVersion: 5, cloudModelAssignments: [], byokProviders: [] },
  });
  await proxy.start();
  t.after(() => proxy.stop());

  const missingRoute = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "unconfigured", messages: [] }),
  });
  assert.equal(missingRoute.status, 422);
  assert.match((await missingRoute.json()).error.message, /没有可用路由/);

  const unknownRole = await fetch(`${proxy.baseUrl}/unknown-model-path`, {
    headers: { Authorization: `Bearer ${proxy.token}` },
  });
  assert.equal(unknownRole.status, 422);
  assert.match((await unknownRole.json()).error.message, /拒绝绕过统一路由/);
});

test("mixed model proxy retries each route before falling back by priority", async (t) => {
  const providerCalls = [];
  const providerServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    providerCalls.push({
      authorization: request.headers.authorization,
      idempotencyKey: request.headers["idempotency-key"],
      model: payload.model,
      path: request.url,
    });
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (payload.model === "provider-one-text") {
      response.statusCode = 429;
      response.end(JSON.stringify({ error: { message: "provider one busy" } }));
      return;
    }
    response.end(
      JSON.stringify({ choices: [{ message: { content: "provider two ok" } }] }),
    );
  });
  await new Promise((resolve, reject) => {
    providerServer.once("error", reject);
    providerServer.listen(0, "127.0.0.1", () => {
      providerServer.off("error", reject);
      resolve();
    });
  });
  t.after(() => new Promise((resolve) => providerServer.close(resolve)));
  const address = providerServer.address();
  assert.ok(address && typeof address !== "string");
  const providerBaseUrl = `http://127.0.0.1:${address.port}/v1`;

  const cloudCalls = [];
  const client = {
    async modelRequest(input) {
      cloudCalls.push({
        body: JSON.parse(String(input.body)),
        idempotencyKey: new Headers(input.headers).get("Idempotency-Key"),
      });
      return Response.json(
        { error: { message: "cloud busy" } },
        { status: 503 },
      );
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
  proxy.configureRouting({
    allowsCustomModels: true,
    cloudModelAssignments: [
      { modelId: "cloud-text", role: "TEXT", priority: 10, enabled: true },
    ],
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "provider-one",
          name: "Provider One",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: providerBaseUrl,
          apiKey: "provider-one-key",
          enabled: true,
          priority: 10,
          modelAssignments: [
            {
              modelId: "provider-one-text",
              role: "TEXT",
              priority: 20,
              enabled: true,
            },
          ],
        },
        {
          id: "provider-two",
          name: "Provider Two",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: providerBaseUrl,
          apiKey: "provider-two-key",
          enabled: true,
          priority: 20,
          modelAssignments: [
            {
              modelId: "provider-two-text",
              role: "TEXT",
              priority: 30,
              enabled: true,
            },
          ],
        },
      ],
    },
  });
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Model-Role": "TEXT",
    },
    body: JSON.stringify({ model: "router-placeholder", messages: [] }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ai-anime-route-attempts"), "7");
  assert.equal((await response.json()).choices[0].message.content, "provider two ok");
  assert.deepEqual(cloudCalls.map((call) => call.body.model), [
    "cloud-text",
    "cloud-text",
    "cloud-text",
  ]);
  const idempotencyKeys = [
    ...cloudCalls.map((call) => call.idempotencyKey),
    ...providerCalls.map((call) => call.idempotencyKey),
  ];
  assert.match(idempotencyKeys[0], /^[0-9a-f-]{36}$/);
  assert.equal(new Set(idempotencyKeys).size, 1);
  assert.deepEqual(providerCalls.map(({ idempotencyKey: _, ...call }) => call), [
    {
      authorization: "Bearer provider-one-key",
      model: "provider-one-text",
      path: "/v1/chat/completions",
    },
    {
      authorization: "Bearer provider-one-key",
      model: "provider-one-text",
      path: "/v1/chat/completions",
    },
    {
      authorization: "Bearer provider-one-key",
      model: "provider-one-text",
      path: "/v1/chat/completions",
    },
    {
      authorization: "Bearer provider-two-key",
      model: "provider-two-text",
      path: "/v1/chat/completions",
    },
  ]);
});

test("Anthropic BYOK is called directly and translated to OpenAI chat format", async (t) => {
  const calls = [];
  const providerServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    calls.push({
      path: request.url,
      apiKey: request.headers["x-api-key"],
      version: request.headers["anthropic-version"],
      payload,
    });
    if (payload.stream) {
      response.setHeader("Content-Type", "text/event-stream");
      response.end(
        [
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-stream","model":"claude-sonnet"}}',
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"流式成功"}}',
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
          'event: message_stop\ndata: {"type":"message_stop"}',
          "",
        ].join("\n\n"),
      );
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        id: "msg-1",
        model: "claude-sonnet",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Anthropic 成功" }],
        usage: { input_tokens: 7, output_tokens: 3 },
      }),
    );
  });
  await new Promise((resolve, reject) => {
    providerServer.once("error", reject);
    providerServer.listen(0, "127.0.0.1", () => {
      providerServer.off("error", reject);
      resolve();
    });
  });
  t.after(() => new Promise((resolve) => providerServer.close(resolve)));
  const address = providerServer.address();
  assert.ok(address && typeof address !== "string");
  const proxy = new CommercialModelProxy(
    { async modelRequest() { throw new Error("cloud must not be called"); } },
    {
      async summary() {
        return { schemaVersion: 1, publicKey: "key", publicKeyHash: "hash" };
      },
    },
  );
  proxy.configureRouting({
    allowsCustomModels: true,
    cloudModelAssignments: [],
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "anthropic",
          name: "Anthropic",
          protocol: "ANTHROPIC",
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          apiKey: "anthropic-secret",
          enabled: true,
          priority: 10,
          modelAssignments: [
            { modelId: "claude-sonnet", role: "TEXT", priority: 10, enabled: true },
          ],
        },
      ],
    },
  });
  await proxy.start();
  t.after(() => proxy.stop());

  const request = (stream) =>
    fetch(`${proxy.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${proxy.token}`,
        "Content-Type": "application/json",
        "X-AI-Anime-Model-Role": "TEXT",
      },
      body: JSON.stringify({
        model: "claude-sonnet",
        stream,
        max_tokens: 512,
        messages: [
          { role: "system", content: "系统提示" },
          { role: "user", content: "你好" },
        ],
      }),
    });
  const response = await request(false);
  const payload = await response.json();
  assert.equal(payload.choices[0].message.content, "Anthropic 成功");
  assert.equal(payload.usage.total_tokens, 10);
  assert.equal(calls[0].path, "/v1/messages");
  assert.equal(calls[0].apiKey, "anthropic-secret");
  assert.equal(calls[0].version, "2023-06-01");
  assert.equal(calls[0].payload.model, "claude-sonnet");
  assert.equal(calls[0].payload.system, "系统提示");
  assert.deepEqual(calls[0].payload.messages, [
    { role: "user", content: [{ type: "text", text: "你好" }] },
  ]);

  const streamResponse = await request(true);
  const streamText = await streamResponse.text();
  assert.equal(streamResponse.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.match(streamText, /流式成功/);
  assert.match(streamText, /chat\.completion\.chunk/);
  assert.match(streamText, /data: \[DONE\]/);
});

test("Gemini BYOK is called directly and translated to OpenAI chat format", async (t) => {
  const calls = [];
  const providerServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    calls.push({
      path: request.url,
      apiKey: request.headers["x-goog-api-key"],
      payload,
    });
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: "Gemini 成功" }], role: "model" },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 4,
          candidatesTokenCount: 2,
          totalTokenCount: 6,
        },
      }),
    );
  });
  await new Promise((resolve, reject) => {
    providerServer.once("error", reject);
    providerServer.listen(0, "127.0.0.1", () => {
      providerServer.off("error", reject);
      resolve();
    });
  });
  t.after(() => new Promise((resolve) => providerServer.close(resolve)));
  const address = providerServer.address();
  assert.ok(address && typeof address !== "string");
  const proxy = new CommercialModelProxy(
    { async modelRequest() { throw new Error("cloud must not be called"); } },
    {
      async summary() {
        return { schemaVersion: 1, publicKey: "key", publicKeyHash: "hash" };
      },
    },
  );
  proxy.configureRouting({
    allowsCustomModels: true,
    cloudModelAssignments: [],
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "gemini",
          name: "Gemini",
          protocol: "GEMINI",
          baseUrl: `http://127.0.0.1:${address.port}/v1beta`,
          apiKey: "gemini-secret",
          enabled: true,
          priority: 10,
          modelAssignments: [
            { modelId: "gemini-2.5-pro", role: "TEXT", priority: 10, enabled: true },
          ],
        },
      ],
    },
  });
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Model-Role": "TEXT",
    },
    body: JSON.stringify({
      model: "gemini-2.5-pro",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "系统提示" },
        { role: "user", content: "你好" },
      ],
    }),
  });
  const payload = await response.json();
  assert.equal(payload.choices[0].message.content, "Gemini 成功");
  assert.equal(payload.usage.total_tokens, 6);
  assert.equal(
    calls[0].path,
    "/v1beta/models/gemini-2.5-pro:generateContent",
  );
  assert.equal(calls[0].apiKey, "gemini-secret");
  assert.deepEqual(calls[0].payload.systemInstruction, {
    parts: [{ text: "系统提示" }],
  });
  assert.equal(
    calls[0].payload.generationConfig.responseMimeType,
    "application/json",
  );
  assert.deepEqual(calls[0].payload.contents, [
    { role: "user", parts: [{ text: "你好" }] },
  ]);
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
  configureCloudProxy(proxy, [
    { modelId: "cloud-text-standard", role: "TEXT" },
  ]);
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

test("local model proxy does not reuse an upstream length after fetch decodes the body", async (t) => {
  const payload = JSON.stringify({
    choices: [{ message: { content: "远端模型已成功返回完整内容" } }],
  });
  const client = {
    async modelRequest() {
      // Node fetch 会自动解压上游正文，但 Response 仍可能保留压缩正文的
      // Content-Encoding / Content-Length。这里模拟 fetch 解压后的形态。
      return new Response(payload, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Encoding": "gzip",
          "Content-Length": "8",
        },
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
  configureCloudProxy(proxy, [
    { modelId: "cloud-text-standard", role: "TEXT" },
  ]);
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "cloud-text-standard", messages: [] }),
  });

  assert.equal(response.headers.get("content-encoding"), null);
  assert.equal(response.headers.get("content-length"), null);
  assert.equal(await response.text(), payload);
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
  configureCloudProxy(proxy, [
    { modelId: "cloud-image-standard", role: "IMAGE_EDIT" },
    { modelId: "cloud-text-standard", role: "TEXT" },
    { modelId: "cloud-video-standard", role: "VIDEO_TEXT_TO_VIDEO" },
  ]);
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
  assert.equal(calls[0].body instanceof FormData, true);
  assert.equal(calls[0].body.get("model"), "cloud-image-standard");
  assert.equal(calls[0].body.get("prompt"), "edit");
  assert.equal(calls[0].body.get("image") instanceof Blob, true);
  assert.equal(new Headers(calls[0].headers).get("Content-Type"), null);

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

test("cloud video requests are normalized to the server contract", async (t) => {
  const calls = [];
  const proxy = new CommercialModelProxy(
    {
      async modelRequest(input) {
        calls.push(input);
        return Response.json({ id: `video-${calls.length}` });
      },
    },
    {
      async summary() {
        return { publicKeyHash: "device-public-key-hash" };
      },
    },
  );
  configureCloudProxy(proxy, [
    { modelId: "cloud-video-standard", role: "VIDEO_ALL_REFERENCE" },
  ]);
  await proxy.start();
  t.after(() => proxy.stop());

  const headers = {
    Authorization: `Bearer ${proxy.token}`,
    "X-AI-Anime-Model-Role": "VIDEO_ALL_REFERENCE",
  };
  const jsonResponse = await fetch(`${proxy.baseUrl}/videos`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "local-placeholder",
      prompt: "animate this scene",
      seconds: "5",
      size: "1280x720",
      generate_audio: true,
      human_review: true,
      scene_optimize: "anime",
      return_last_frame: true,
    }),
  });
  assert.equal(jsonResponse.status, 200);
  assert.deepEqual(JSON.parse(calls[0].body), {
    model: "cloud-video-standard",
    prompt: "animate this scene",
    seconds: "5",
    size: "1280x720",
  });

  const form = new FormData();
  form.append("model", "local-placeholder");
  form.append("prompt", "keep the character consistent");
  form.append("seconds", "8");
  form.append("size", "1080x1920");
  form.append("human_review", "true");
  form.append("scene_optimize", "anime");
  form.append(
    "reference_images",
    new Blob(["image-bytes"], { type: "image/png" }),
    "character.png",
  );
  form.append(
    "reference_videos",
    new Blob(["video-bytes"], { type: "video/mp4" }),
    "motion.mp4",
  );
  const multipartResponse = await fetch(`${proxy.baseUrl}/videos`, {
    method: "POST",
    headers,
    body: form,
  });
  assert.equal(multipartResponse.status, 200);
  assert.equal(calls[1].body instanceof FormData, true);
  assert.equal(calls[1].body.get("model"), "cloud-video-standard");
  assert.equal(calls[1].body.get("prompt"), "keep the character consistent");
  assert.equal(calls[1].body.get("human_review"), null);
  assert.equal(calls[1].body.get("scene_optimize"), null);
  assert.equal(calls[1].body.get("reference_images"), null);
  assert.equal(calls[1].body.get("reference_videos"), null);
  assert.equal(calls[1].body.get("reference_image") instanceof Blob, true);
  assert.equal(calls[1].body.get("reference_video") instanceof Blob, true);
});

test("local model proxy infers the dedicated audio music route", async (t) => {
  const calls = [];
  const proxy = new CommercialModelProxy(
    {
      async modelRequest(input) {
        calls.push(input);
        return new Response(Buffer.from("music"), {
          headers: { "Content-Type": "audio/mpeg" },
        });
      },
    },
    {
      async summary() {
        return { publicKeyHash: "device-public-key-hash" };
      },
    },
  );
  configureCloudProxy(proxy, [
    { modelId: "cloud-music", role: "AUDIO_MUSIC" },
  ]);
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/audio/music/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "local-placeholder",
      mode: "MUSIC",
      prompt: "quiet piano",
      duration: 30,
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/v1/audio/music/generations");
  assert.equal(JSON.parse(calls[0].body).model, "cloud-music");
});

test("cloud voice design keeps its explicit role and routes the raw model code", async (t) => {
  const calls = [];
  const modelId = "QWEN3_TTS_VD_2026_01_26";
  const proxy = new CommercialModelProxy(
    {
      async modelRequest(input) {
        calls.push(input);
        return new Response(Buffer.from("designed-voice"), {
          headers: {
            "Content-Type": "audio/wav",
            "X-Voice-Id": "qwen_voice_123",
          },
        });
      },
    },
    {
      async summary() {
        return { publicKeyHash: "device-public-key-hash" };
      },
    },
  );
  configureCloudProxy(proxy, [
    { modelId, role: "AUDIO_VOICE_DESIGN" },
  ]);
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Model-Role": "AUDIO_VOICE_DESIGN",
      "X-AI-Anime-Model-Selector": `cloud:${modelId}`,
    },
    body: JSON.stringify({
      model: `cloud:${modelId}`,
      mode: "VOICE_DESIGN",
      voice_prompt: "清澈温暖的青年女声",
      preview_text: "你好，这是声线试听。",
      language: "zh",
      sample_rate: 24000,
      response_format: "wav",
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-voice-id"), "qwen_voice_123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/v1/audio/speech");
  assert.equal(JSON.parse(calls[0].body).model, modelId);
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
  configureCloudProxy(proxy, [
    { modelId: "cloud-video-standard", role: "VIDEO_TEXT_TO_VIDEO" },
  ]);
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
  configureCloudProxy(proxy, [
    { modelId: "cloud-text-standard", role: "TEXT" },
  ]);
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

test("local model proxy terminates a model request at its absolute deadline", async (t) => {
  let upstreamSignal;
  const client = {
    async modelRequest(input) {
      upstreamSignal = input.signal;
      return await new Promise((resolve, reject) => {
        input.signal.addEventListener(
          "abort",
          () => reject(input.signal.reason),
          { once: true },
        );
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
  const proxy = new CommercialModelProxy(
    client,
    device,
    undefined,
    { requestTimeoutMs: 25 },
  );
  configureCloudProxy(proxy, [
    { modelId: "cloud-text-standard", role: "TEXT" },
  ]);
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "cloud-text-standard", messages: [] }),
  });

  assert.equal(response.status, 504);
  assert.equal(upstreamSignal.aborted, true);
  const payload = await response.json();
  assert.equal(payload.error.code, "MODEL_REQUEST_TIMEOUT");
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

test("cloud model writes do not blindly replay transient gateway failures", async () => {
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
      if (call.url.endsWith("/v1/images/generations")) {
        modelAttempts += 1;
        return new Response("gateway timeout", { status: 504 });
      }
      throw new Error(`unexpected request ${call.url}`);
    },
  });

  const response = await client.modelRequest({
    method: "POST",
    path: "/v1/images/generations",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "cloud-image-standard", prompt: "cat" }),
    devicePublicKeyHash: "device-public-key-hash",
  });

  assert.equal(response.status, 504);
  const modelCalls = calls.filter((call) =>
    call.url.endsWith("/v1/images/generations"),
  );
  assert.equal(modelCalls.length, 1);
  assert.match(
    new Headers(modelCalls[0].init.headers).get("Idempotency-Key"),
    /^[0-9a-f-]{36}$/,
  );
});

test("cloud model reads still retry transient gateway failures", async () => {
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://aianime.122-193-11-199.sslip.io",
    accessToken: "client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user,
    tenant,
  };
  let modelAttempts = 0;
  const client = new CommercialApiClient({
    baseUrl: "https://aianime.122-193-11-199.sslip.io",
    sessionStore: store,
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.endsWith("/v1/models")) {
        modelAttempts += 1;
        return modelAttempts < 3
          ? new Response("gateway timeout", { status: 504 })
          : Response.json({ data: [] });
      }
      throw new Error(`unexpected request ${target}`);
    },
  });

  const response = await client.modelRequest({
    method: "GET",
    path: "/v1/models",
    headers: {},
    devicePublicKeyHash: "device-public-key-hash",
  });

  assert.equal(response.status, 200);
  assert.equal(modelAttempts, 3);
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
