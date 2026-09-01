import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveProviderStrategy } from "../src/commercial-model-providers/factory.ts";
import {
  BYOK_MODEL_ROLES,
  EncryptedFileCommercialModelAccessStore,
  effectiveModelRuntimeSettings,
  fetchByokModelCatalog,
  fetchByokProviderModelIds,
} from "../src/commercial-model-access.ts";
import {
  assistantModelSelectionFromBody,
  prepareBodyForRoute,
} from "../src/commercial-model-proxy-http.ts";
import {
  CommercialModelProxy,
  modelRoutingSnapshot,
} from "../src/commercial-model-proxy.ts";
import { parseCommercialBootstrapWire } from "../src/commercial-contracts.ts";
import {
  COMMERCIAL_CHANNELS,
  CommercialApiClient,
  CommercialApiError,
  registerCommercialIpc,
} from "../src/commercial.ts";
import { COMMERCIAL_IPC_ERROR_PREFIX } from "../src/commercial-ipc.ts";
import {
  mergeModelCapabilities,
  mergeModelCatalogs,
} from "../src/commercial-ipc-support.ts";

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

const TEST_IDS = {
  license: "11111111-1111-4111-8111-111111111111",
  device: "22222222-2222-4222-8222-222222222222",
  activation: "33333333-3333-4333-8333-333333333333",
  lease: "44444444-4444-4444-8444-444444444444",
  model: "55555555-5555-4555-8555-555555555555",
  release: "66666666-6666-4666-8666-666666666666",
  artifact: "77777777-7777-4777-8777-777777777777",
};

function authorizationFixture({
  editionType = "PROFESSIONAL",
  allowsCustomModels = true,
  activated = true,
  deviceId = TEST_IDS.device,
  lease = null,
} = {}) {
  return {
    license: {
      id: TEST_IDS.license,
      versionCode: "professional-2026",
      versionName: "Professional",
      status: "ACTIVE",
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
      maxDevices: 3,
      activeDevices: activated ? 1 : 0,
      editionType,
      allowsCustomModels,
    },
    device: activated
      ? {
          id: deviceId,
          publicKeyHash: "device-public-key-hash",
          deviceName: "Desktop",
          platform: "windows",
          arch: "x86_64",
          clientVersion: "1.1.62",
          status: "ACTIVE",
          createdAt: "2026-08-01T00:00:00Z",
          lastSeenAt: "2026-08-01T01:00:00Z",
        }
      : null,
    activation: activated
      ? {
          id: TEST_IDS.activation,
          licenseId: TEST_IDS.license,
          deviceId,
          status: "ACTIVE",
          activatedAt: "2026-08-01T00:00:00Z",
          lastHeartbeatAt: "2026-08-01T01:00:00Z",
          endedAt: "",
          endReason: "",
        }
      : null,
    lease,
  };
}

function modelItemFixture(overrides = {}) {
  return {
    id: TEST_IDS.model,
    code: "cloud-text-v1",
    displayName: "Cloud Text",
    operation: "TEXT",
    capabilityJson: "{}",
    parameterSchemaJson: "{}",
    unitsPerCall: 1,
    clientVisible: true,
    status: "ACTIVE",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    isDefault: true,
    ...overrides,
  };
}

test("desktop route parser follows the shared cross-runtime model contract", async () => {
  const contract = JSON.parse(await readFile(
    new URL("../../tests/fixtures/model-route-contract.json", import.meta.url),
    "utf8",
  ));
  const requestBody = (model) => Buffer.from(JSON.stringify({ model }), "utf8");

  for (const item of contract.valid) {
    assert.deepEqual(
      assistantModelSelectionFromBody(
        requestBody(item.model),
        "application/json",
        "ai-assistant",
      ),
      {
        selector: item.selector,
        reasoningEffort: item.reasoningEffort,
      },
      item.id,
    );
  }
  for (const item of contract.invalid) {
    assert.throws(
      () => assistantModelSelectionFromBody(
        requestBody(item.model),
        "application/json",
        "ai-assistant",
      ),
      (error) => error instanceof CommercialApiError && error.status === 422,
      item.id,
    );
  }
});

test("model roles omit operations without an application call chain", () => {
  assert.equal(BYOK_MODEL_ROLES.includes("RERANK"), false);
  assert.equal(BYOK_MODEL_ROLES.includes("MODERATION"), false);
});

test("active cloud catalogs always expose exact route selectors", () => {
  const active = mergeModelCatalogs({
    catalogVersion: "cloud-v1",
    items: [
      {
        id: "model-1",
        code: "gpt-5",
        displayName: "GPT-5",
        operation: "TEXT",
        capabilityJson: "{}",
        parameterSchemaJson: "{}",
      },
    ],
  });

  assert.equal(active.catalogVersion, "cloud-v1");
  assert.deepEqual(JSON.parse(active.items[0].capabilityJson), {
    routeSelector: "cloud:gpt-5",
  });
});

test("image catalog synchronization preserves declared ratio-to-size capabilities", () => {
  const capabilities = new Map();

  mergeModelCapabilities(
    {
      catalogVersion: "cloud-v1",
      items: [
        modelItemFixture({
          code: "QWEN_IMAGE_2512",
          operation: "IMAGE",
          capabilityJson: JSON.stringify({
            imagePromptProfile: "qwen-image",
            ratioOptions: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
            resolutionOptions: [
              "1328x1328",
              "1664x928",
              "928x1664",
              "1472x1140",
              "1140x1472",
              "1584x1056",
              "1056x1584",
            ],
          }),
          parameterSchemaJson: JSON.stringify({
            properties: {
              size: {
                enum: [
                  "1328x1328",
                  "1664x928",
                  "928x1664",
                  "1472x1140",
                  "1140x1472",
                  "1584x1056",
                  "1056x1584",
                ],
              },
              quality: { enum: ["standard", "hd"] },
            },
          }),
        }),
      ],
    },
    capabilities,
  );

  assert.deepEqual(capabilities.get("QWEN_IMAGE_2512"), {
    modelId: "QWEN_IMAGE_2512",
    extraParameterNames: ["size", "quality"],
    imagePromptProfile: "qwen-image",
    imageRatioOptions: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    imageSizeOptions: [
      "1328x1328",
      "1664x928",
      "928x1664",
      "1472x1140",
      "1140x1472",
      "1584x1056",
      "1056x1584",
    ],
  });
});

test("provider strategy factory covers native protocols, audio providers, and every generic model role", () => {
  assert.equal(
    resolveProviderStrategy("OPENAI_COMPATIBLE", "https://api.fish.audio/v1").id,
    "fish-audio",
  );
  assert.equal(
    resolveProviderStrategy("OPENAI_COMPATIBLE", "https://api.minimax.io/v1").id,
    "minimax-audio",
  );
  assert.equal(
    resolveProviderStrategy("OPENAI_COMPATIBLE", "https://api.elevenlabs.io/v1").id,
    "elevenlabs",
  );
  assert.equal(
    resolveProviderStrategy("OPENAI_COMPATIBLE", "https://api.deepgram.com/v1").id,
    "deepgram",
  );
  assert.equal(
    resolveProviderStrategy("OPENAI_COMPATIBLE", "https://api.cartesia.ai/v1").id,
    "cartesia",
  );
  assert.equal(
    resolveProviderStrategy("OPENAI_COMPATIBLE", "https://api.openai.com/v1").id,
    "openai-native",
  );
  assert.equal(
    resolveProviderStrategy(
      "OPENAI_COMPATIBLE",
      "https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    ).id,
    "aliyun-model-studio",
  );
  const tokenPlan = resolveProviderStrategy(
    "OPENAI_COMPATIBLE",
    "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
  );
  assert.equal(tokenPlan.id, "aliyun-token-plan");
  assert.throws(
    () => tokenPlan.validateInputAssignments?.([
      { modelId: "qwen-audio-3.0-tts-plus", role: "AUDIO_VOICE_DESIGN" },
    ]),
    /Token Plan.*不能配置为音频、图像或视频用途/,
  );
  assert.doesNotThrow(() => tokenPlan.validateAssignments([
    { modelId: "text-model", role: "TEXT" },
  ]));
  assert.equal(
    resolveProviderStrategy("OPENAI_COMPATIBLE", "https://models.example.test/v1").id,
    "openai-compatible",
  );
  assert.equal(
    resolveProviderStrategy("ANTHROPIC", "https://api.anthropic.com/v1").id,
    "anthropic",
  );
  assert.equal(
    resolveProviderStrategy("GEMINI", "https://generativelanguage.googleapis.com/v1beta").id,
    "gemini",
  );
  const generic = resolveProviderStrategy(
    "OPENAI_COMPATIBLE",
    "https://models.example.test/v1",
  );
  assert.doesNotThrow(() =>
    generic.validateAssignments(
      BYOK_MODEL_ROLES.map((role) => ({ modelId: `model-${role}`, role })),
    ),
  );
});

const passthroughSecureStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value, "utf8"),
  decryptString: (value) => value.toString("utf8"),
};

test("desktop rejects runtime parameter overrides beyond the shared depth limit", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-model-depth-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new EncryptedFileCommercialModelAccessStore(
    join(directory, "model-access.bin"),
    passthroughSecureStorage,
  );
  let parameterOverrides = { value: true };
  for (let depth = 0; depth < 9; depth += 1) {
    parameterOverrides = { nested: parameterOverrides };
  }

  await assert.rejects(
    store.selectCloud([
      {
        modelId: "cloud-text",
        role: "TEXT",
        priority: 100,
        enabled: true,
        runtimeOverrides: { parameterOverrides },
      },
    ]),
    /嵌套过深/,
  );
});

function configureCloudProxy(proxy, assignments, modelCapabilities = []) {
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
    modelCapabilities,
  });
}

const user = { id: 1, username: "client" };
const tenant = { id: 2, code: "customer-a", name: "Customer A" };

test("commercial IPC serializes status, code, and request ID for the renderer", async () => {
  const handlers = new Map();
  registerCommercialIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      removeHandler: (channel) => handlers.delete(channel),
    },
    client: { baseUrl: "https://gateway.test" },
    deviceIdentity: {},
    modelAccessStore: {},
    deviceName: "DESKTOP-01",
    platform: "win32",
    arch: "x64",
    clientVersion: "1.0.0",
    isAllowedSender: () => false,
    onAuthenticated: () => undefined,
    onModelAccessChanged: () => undefined,
    onLoggedOut: () => undefined,
  });

  await assert.rejects(
    handlers.get(COMMERCIAL_CHANNELS.status)({ sender: { id: 99 } }),
    (error) => {
      const index = error.message.indexOf(COMMERCIAL_IPC_ERROR_PREFIX);
      assert.notEqual(index, -1);
      const payload = JSON.parse(
        error.message.slice(index + COMMERCIAL_IPC_ERROR_PREFIX.length),
      );
      assert.deepEqual(payload, {
        message: "拒绝非主窗口的 Commercial Gateway 调用",
        status: 403,
        code: "IPC_SENDER_FORBIDDEN",
        requestId: null,
      });
      return true;
    },
  );
});

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
      login: async (input) => {
        calls.push({ type: "login", input });
        return {
          authenticated: true,
          expiresAtEpochMs: 10_000,
          user,
          tenant,
        };
      },
      currentLicense: async () => authorizationFixture(),
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
        schemaVersion: 5,
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
  });

  await handlers.get(COMMERCIAL_CHANNELS.login)(
    { sender: { id: 1 } },
    {
      loginType: "PASSWORD",
      tenantCode: " customer-a ",
      username: " client ",
      password: " Secret 123 ",
    },
  );

  assert.deepEqual(calls, [
    {
      type: "login",
      input: {
        loginType: "PASSWORD",
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
      baseUrl: "http://203.0.113.10:8889",
      restoreSession: async () => null,
    },
    deviceIdentity: {},
    modelAccessStore: {
      load: async () => ({
        schemaVersion: 5,
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
        return authorizationFixture({ deviceId });
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
                modes: ["SPEECH"],
                audioModes: ["VOICE_DESIGN"],
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
        schemaVersion: 5,
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
    schemaVersion: 5,
    cloudModelAssignments: [],
    byokProviders: [
      {
        id: "provider-one",
        name: "Provider One",
        protocol: "OPENAI_COMPATIBLE",
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
      baseUrl: "http://203.0.113.10:8889",
      currentLicense: async () =>
        authorizationFixture({
          editionType: "STANDARD",
          allowsCustomModels: false,
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
    gatewayOrigin: "http://203.0.113.10:8889",
  });
});

test("Bootstrap merges configured BYOK models with cloud SKUs", async () => {
  const handlers = new Map();
  const synchronized = [];
  const access = {
    schemaVersion: 5,
    cloudModelAssignments: [],
    byokProviders: [
      {
        id: "provider-one",
        name: "Provider One",
        protocol: "OPENAI_COMPATIBLE",
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
      baseUrl: "http://203.0.113.10:8889",
      bootstrap: async () => parseCommercialBootstrapWire({
        softwareAuthorization: authorizationFixture(),
        personalQuota: null,
        models: {
          catalogVersion: "cloud-1",
          items: [
            modelItemFixture({
              code: "cloud/text-standard",
              displayName: "Cloud Text",
            }),
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
      currentLicense: async () => authorizationFixture(),
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
        schemaVersion: 5,
        cloudModelAssignments: [],
        byokProviders: [
          {
            id: "provider-one",
            name: "Provider One",
            protocol: "OPENAI_COMPATIBLE",
            baseUrl: "https://byok.example/v1",
            apiKey: "secret",
            enabled: true,
            priority: 100,
            modelAssignments: [
              {
                modelId: "byok-text",
                role: "TEXT",
                priority: 100,
                enabled: true,
              },
            ],
          },
        ],
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
      currentLicense: async () => authorizationFixture(),
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
  const devicePublicKeyHash = "a".repeat(64);
  const issuedAt = "2026-08-01T00:00:00Z";
  const expiresAt = "2099-01-01T00:00:00Z";
  const payloadJson = JSON.stringify({
    activationId: TEST_IDS.activation,
    licenseId: TEST_IDS.license,
    deviceId: TEST_IDS.device,
    devicePublicKeyHash,
    editionType: "PROFESSIONAL",
    allowsCustomModels: true,
    issuedAt,
    expiresAt,
    keyId,
  });
  const lease = {
    id: TEST_IDS.lease,
    activationId: TEST_IDS.activation,
    issuedAt,
    expiresAt,
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
      bootstrap: async () => parseCommercialBootstrapWire({
        softwareAuthorization: authorizationFixture({ lease }),
        personalQuota: null,
        models: null,
        release: null,
        warnings: [],
      }),
    },
    deviceIdentity: {
      summary: async () => ({
        publicKey: "public-key",
        publicKeyHash: devicePublicKeyHash,
      }),
    },
    modelAccessStore: {
      load: async () => ({
        schemaVersion: 5,
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
    devicePublicKeyHash,
  });

  const bootstrap = handlers.get(COMMERCIAL_CHANNELS.bootstrap);
  const result = await bootstrap({ sender: { id: 1 } }, {});

  assert.equal(result.softwareAuthorization.lease.verifiedOffline, true);
  assert.equal("payloadJson" in result.softwareAuthorization.lease, false);
  assert.equal("signature" in result.softwareAuthorization.lease, false);
});

test("video catalog synchronization sends only projected generation capabilities", async () => {
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
      currentLicense: async () => authorizationFixture({ deviceId }),
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
                    capabilityJson: JSON.stringify({
                      contextWindowTokens: 204800,
                    }),
                    parameterSchemaJson: JSON.stringify({
                      properties: {
                        max_completion_tokens: {
                          type: "integer",
                          minimum: 1,
                          maximum: 65536,
                        },
                        reasoning_effort: {
                          type: "string",
                          enum: ["none", "low", "medium", "high"],
                          default: "low",
                        },
                      },
                    }),
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
                    isDefault: true,
                    capabilityJson: JSON.stringify({
                      videoWorkflow: "advanced-reference",
                      ratioOptions: ["16:9", "9:16"],
                      resolutionOptions: ["480p", "720p", "768P", "1080p"],
                      sceneOptimizeOptions: ["ANIME", "realistic"],
                      supportsHumanReview: true,
                      supportedModes: [
                        "textToVideo",
                        "firstFrame",
                        "firstLastFrame",
                      ],
                      maxReferenceImages: 5,
                      referenceLimits: {
                        videos: 1,
                        audios: 0,
                        total: 6,
                      },
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
                    parameterSchemaJson: JSON.stringify({
                      properties: {
                        duration: {
                          minimum: 4,
                          maximum: 15,
                          enum: [4, 8, 12],
                        },
                      },
                    }),
                  },
                  {
                    id: "video-2",
                    code: "cloud/video-basic",
                    displayName: "Cloud Video Basic",
                    operation: "VIDEO",
                    capabilityJson: JSON.stringify({
                      supportedModes: ["firstFrame"],
                      ratioOptions: ["16:9", "9:16", "1:1"],
                      generateAudio: false,
                      resolutionOptions: [
                        "1344x768",
                        "768x1344",
                        "1024x1024",
                      ],
                    }),
                    parameterSchemaJson: JSON.stringify({
                      properties: {
                        size: {
                          enum: ["1344x768", "768x1344", "1024x1024"],
                        },
                        seconds: { minimum: 1, maximum: 15 },
                        steps: { type: "integer", minimum: 1, maximum: 50 },
                        seed: { type: "integer", minimum: 0 },
                        turbo: { type: "boolean", default: false },
                      },
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
        schemaVersion: 5,
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
      explicitCloudModelAssignments,
    ) => synchronized.push({
      cloudModelAssignments,
      modelCapabilities,
      explicitCloudModelAssignments,
    }),
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
      contextWindow: 204800,
      maxOutputTokens: 65536,
      reasoningEfforts: ["none", "low", "medium", "high"],
      defaultReasoningEffort: "low",
    },
    {
      modelId: "cloud/video-standard",
      role: "VIDEO_TEXT_TO_VIDEO",
      priority: 100,
      enabled: true,
    },
    {
      modelId: "cloud/video-standard",
      role: "VIDEO_IMAGE_TO_VIDEO",
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
      extraParameterNames: ["duration"],
      videoWorkflow: "advanced-reference",
      videoRatioOptions: ["16:9", "9:16"],
      videoResolutionOptions: ["480p", "720p", "768p", "1080p"],
      videoSceneOptimizeOptions: ["ANIME", "realistic"],
      videoSupportsHumanReview: true,
      videoGenerationMinSeconds: 4,
      videoGenerationMaxSeconds: 15,
      videoDurationOptions: [4, 8, 12],
      maxReferenceImages: 5,
      maxReferenceVideos: 1,
      maxReferenceAudios: 0,
      maxReferenceTotal: 6,
      referenceAudioMinSeconds: 1.8,
      referenceAudioMaxSeconds: 15.2,
      referenceAudioTotalMinSeconds: 2,
      referenceAudioTotalMaxSeconds: 15.2,
      referenceVideoMinSeconds: 3,
      referenceVideoMaxSeconds: 10,
      referenceVideoTotalMinSeconds: 5,
      referenceVideoTotalMaxSeconds: 20,
    },
    {
      modelId: "cloud/video-basic",
      extraParameterNames: ["size", "seconds", "steps", "seed", "turbo"],
      videoRatioOptions: ["16:9", "9:16", "1:1"],
      videoSizeOptions: ["1344x768", "768x1344", "1024x1024"],
      videoSupportsGenerateAudio: false,
      videoExtraParameterNames: ["steps", "seed", "turbo"],
      videoGenerationMinSeconds: 1,
      videoGenerationMaxSeconds: 15,
    },
  ]);
  assert.deepEqual(
    new Set(
      synchronized.at(-1).explicitCloudModelAssignments.map(
        (assignment) => `${assignment.role}:${assignment.modelId}`,
      ),
    ),
    new Set([
      "TEXT:cloud/text-standard",
      "VIDEO_TEXT_TO_VIDEO:cloud/video-standard",
      "VIDEO_IMAGE_TO_VIDEO:cloud/video-standard",
      "VIDEO_IMAGE_TO_VIDEO:cloud/video-basic",
      "VIDEO_FIRST_LAST_FRAME:cloud/video-standard",
    ]),
  );
  assert.deepEqual(
    synchronized.at(-1).explicitCloudModelAssignments.find(
      (assignment) => assignment.role === "TEXT",
    ),
    {
      modelId: "cloud/text-standard",
      role: "TEXT",
      priority: 100,
      enabled: true,
      contextWindow: 204800,
      maxOutputTokens: 65536,
      reasoningEfforts: ["none", "low", "medium", "high"],
      defaultReasoningEffort: "low",
    },
  );
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
      baseUrl: "http://203.0.113.10:8889",
      checkRelease: async (query) => {
        receivedQuery = query;
        return {
          available: false,
          required: false,
          reason: "up-to-date",
          version: { artifacts: [] },
        };
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
    version: { artifacts: [] },
    artifactId: null,
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
    await downloadUpdate({ sender: { id: 1 } }, TEST_IDS.artifact),
    { version: "1.1.6" },
  );
  assert.deepEqual(await installUpdate({ sender: { id: 1 } }), {
    accepted: true,
  });

  assert.deepEqual(downloaded, [TEST_IDS.artifact]);
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
        capabilities: {
          supportedModes: ["TEXT_TO_IMAGE"],
          resolutionOptions: ["1024x1024"],
        },
        capabilityOverrides: {
          resolutionOptions: ["1024x1024", "1536x1024"],
        },
        parameterSchema: {
          type: "object",
          properties: { quality: { enum: ["standard", "hd"] } },
        },
        contextWindow: 32768,
        maxOutputTokens: 2048,
        reasoningEfforts: ["low", "medium", "xhigh"],
        defaultReasoningEffort: "low",
        runtimeOverrides: {
          contextWindow: 65536,
          maxOutputTokens: 8192,
          reasoningEfforts: ["medium", "xhigh"],
          defaultReasoningEffort: "xhigh",
          parameterOverrides: {
            quality: "hd",
            options: { transparent: true },
          },
        },
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
      capabilities: {
        supportedModes: ["TEXT_TO_IMAGE"],
        resolutionOptions: ["1024x1024"],
      },
      capabilityOverrides: {
        resolutionOptions: ["1024x1024", "1536x1024"],
      },
      parameterSchema: {
        type: "object",
        properties: { quality: { enum: ["standard", "hd"] } },
      },
      contextWindow: 32768,
      maxOutputTokens: 2048,
      reasoningEfforts: ["low", "medium", "xhigh"],
      defaultReasoningEffort: "low",
      runtimeOverrides: {
        contextWindow: 65536,
        maxOutputTokens: 8192,
        reasoningEfforts: ["medium", "xhigh"],
        defaultReasoningEffort: "xhigh",
        parameterOverrides: {
          quality: "hd",
          options: { transparent: true },
        },
      },
    },
  ]);
  assert.deepEqual(
    effectiveModelRuntimeSettings(restored.byokProviders[0].modelAssignments[0]),
    {
      contextWindow: 65536,
      maxOutputTokens: 8192,
      reasoningEfforts: ["medium", "xhigh"],
      defaultReasoningEffort: "xhigh",
      parameterOverrides: {
        quality: "hd",
        options: { transparent: true },
      },
    },
  );
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
            capabilities: {
              supportedModes: ["TEXT_TO_IMAGE"],
              resolutionOptions: ["1024x1024"],
            },
            capabilityOverrides: {
              resolutionOptions: ["1024x1024", "1536x1024"],
            },
            parameterSchema: {
              type: "object",
              properties: { quality: { enum: ["standard", "hd"] } },
            },
            contextWindow: 32768,
            maxOutputTokens: 2048,
            reasoningEfforts: ["low", "medium", "xhigh"],
            defaultReasoningEffort: "low",
            runtimeOverrides: {
              contextWindow: 65536,
              maxOutputTokens: 8192,
              reasoningEfforts: ["medium", "xhigh"],
              defaultReasoningEffort: "xhigh",
              parameterOverrides: {
                quality: "hd",
                options: { transparent: true },
              },
            },
          },
        ],
      },
    ],
  });
});

test("model runtime overrides preserve xhigh and replace the request output limit", async () => {
  const prepared = await prepareBodyForRoute(
    Buffer.from(JSON.stringify({
      model: "stale-model",
      messages: [],
      max_completion_tokens: 128,
    })),
    "application/json",
    "Qwen3.8-27B",
    false,
    "xhigh",
    8192,
  );

  assert.deepEqual(JSON.parse(prepared.body), {
    model: "Qwen3.8-27B",
    messages: [],
    max_completion_tokens: 8192,
    reasoning_effort: "xhigh",
  });
});

test("unselected reasoning leaves the upstream request parameters unset", async () => {
  const prepared = await prepareBodyForRoute(
    Buffer.from(JSON.stringify({
      model: "stale-model",
      messages: [],
    })),
    "application/json",
    "QWEN3_8_27B",
    false,
  );
  const body = JSON.parse(prepared.body);

  assert.equal(body.model, "QWEN3_8_27B");
  assert.equal(Object.hasOwn(body, "reasoning_effort"), false);
  assert.equal(Object.hasOwn(body, "chat_template_kwargs"), false);
  assert.equal(Object.hasOwn(body, "include_reasoning"), false);
});

test("schema-driven parameter overrides deep-merge into non-text JSON requests", async () => {
  const prepared = await prepareBodyForRoute(
    Buffer.from(JSON.stringify({
      model: "stale-image-model",
      prompt: "portrait",
      quality: "standard",
      options: { seed: 42, transparent: false },
    })),
    "application/json",
    "image-model-a",
    false,
    undefined,
    undefined,
    [],
    {
      quality: "hd",
      options: { transparent: true },
    },
  );

  assert.deepEqual(JSON.parse(prepared.body), {
    model: "image-model-a",
    prompt: "portrait",
    quality: "hd",
    options: { seed: 42, transparent: true },
  });
});

test("schema-driven parameter overrides serialize into non-text multipart requests", async () => {
  const source = new FormData();
  source.set("model", "stale-image-model");
  source.set("prompt", "edit portrait");
  source.set("quality", "standard");
  const encoded = new Request("http://model-proxy.local/images/edits", {
    method: "POST",
    body: source,
  });
  const prepared = await prepareBodyForRoute(
    Buffer.from(await encoded.arrayBuffer()),
    encoded.headers.get("content-type") ?? "",
    "image-model-a",
    false,
    undefined,
    undefined,
    [],
    {
      quality: "hd",
      options: { transparent: true },
    },
  );

  assert.equal(prepared.body instanceof FormData, true);
  assert.equal(prepared.body.get("model"), "image-model-a");
  assert.equal(prepared.body.get("prompt"), "edit portrait");
  assert.equal(prepared.body.get("quality"), "hd");
  assert.equal(prepared.body.get("options"), JSON.stringify({ transparent: true }));
});

test("outdated model access settings are discarded instead of migrated", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-model-access-outdated-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "model-access.bin");
  await writeFile(
    filePath,
    Buffer.from(
      JSON.stringify({
        schemaVersion: 3,
        mode: "byok",
        cloudModelAssignments: [],
        byokBaseUrl: "https://outdated.example/v1",
        byokApiKey: "outdated-secret",
        byokModelAssignments: [],
      }),
      "utf8",
    ),
  );

  const restored = await new EncryptedFileCommercialModelAccessStore(
    filePath,
    passthroughSecureStorage,
  ).load();
  assert.deepEqual(restored, {
    schemaVersion: 5,
    cloudModelAssignments: [],
    byokProviders: [],
  });
  await assert.rejects(readFile(filePath), { code: "ENOENT" });
});

test("unsupported saved roles discard the model access file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-model-access-role-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "model-access.bin");
  await writeFile(
    filePath,
    Buffer.from(
      JSON.stringify({
        schemaVersion: 5,
        cloudModelAssignments: [],
        byokProviders: [
          {
            id: "provider-one",
            name: "Provider One",
            protocol: "OPENAI_COMPATIBLE",
            baseUrl: "https://models.example/v1",
            apiKey: "saved-secret",
            enabled: true,
            priority: 10,
            modelAssignments: [
              { modelId: "text-model", role: "TEXT", priority: 10, enabled: true },
              { modelId: "old-reranker", role: "RERANK", priority: 20, enabled: true },
            ],
          },
        ],
      }),
      "utf8",
    ),
  );

  const restored = await new EncryptedFileCommercialModelAccessStore(
    filePath,
    passthroughSecureStorage,
  ).load();
  assert.deepEqual(restored, {
    schemaVersion: 5,
    cloudModelAssignments: [],
    byokProviders: [],
  });
  await assert.rejects(readFile(filePath), { code: "ENOENT" });
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

test("invalid saved BYOK providers are discarded", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-model-access-invalid-url-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "model-access.bin");
  const persisted = Buffer.from(
    JSON.stringify({
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "invalid-provider",
          name: "Invalid Provider",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: "not a url",
          apiKey: "",
          enabled: true,
          priority: 100,
          modelAssignments: [],
        },
      ],
    }),
    "utf8",
  );
  await writeFile(filePath, persisted);

  const reset = await new EncryptedFileCommercialModelAccessStore(
    filePath,
    passthroughSecureStorage,
  ).load();
  assert.deepEqual(reset, {
    schemaVersion: 5,
    cloudModelAssignments: [],
    byokProviders: [],
  });
  await assert.rejects(readFile(filePath), { code: "ENOENT" });
});

test("model access self-heals unreadable ciphertext and malformed JSON", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-model-access-corrupt-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  for (const [name, secureStorage, contents] of [
    ["ciphertext", {
      ...passthroughSecureStorage,
      decryptString() {
        throw new Error("credential key changed");
      },
    }, "encrypted"],
    ["json", passthroughSecureStorage, "{"],
  ]) {
    await t.test(name, async () => {
      const filePath = join(directory, `${name}.bin`);
      await writeFile(filePath, contents);
      const restored = await new EncryptedFileCommercialModelAccessStore(
        filePath,
        secureStorage,
      ).load();

      assert.deepEqual(restored, {
        schemaVersion: 5,
        cloudModelAssignments: [],
        byokProviders: [],
      });
      await assert.rejects(readFile(filePath), { code: "ENOENT" });
    });
  }
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
          {
            id: "image-model-a",
            object: "model",
            max_model_len: 32768,
            parameter_schema: {
              properties: {
                reasoning_effort: {
                  enum: ["low", "medium", "xhigh"],
                  default: "low",
                },
              },
            },
          },
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
  assert.deepEqual(result.modelMetadata[0], {
    id: "image-model-a",
    parameterSchema: {
      properties: {
        reasoning_effort: {
          enum: ["low", "medium", "xhigh"],
          default: "low",
        },
      },
    },
    contextWindow: 32768,
    reasoningEfforts: ["low", "medium", "xhigh"],
    defaultReasoningEffort: "low",
  });
  assert.match(result.catalogVersion, /^byok-[0-9a-f]{16}$/);
  assert.equal(JSON.stringify(result).includes("user-secret-key"), false);
});

test("native audio strategies expose provider-specific model discovery", async () => {
  const access = {
    schemaVersion: 5,
    cloudModelAssignments: [],
    byokProviders: [],
  };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init.headers) });
    if (String(url).includes("elevenlabs")) {
      return Response.json([
        { model_id: "eleven_multilingual_v2" },
        { model_id: "eleven_ttv_v3" },
      ]);
    }
    if (String(url).includes("deepgram")) {
      return Response.json({
        tts: [
          { canonical_name: "aura-2-thalia-en" },
          { canonical_name: "aura-2-fujimi-ja" },
        ],
      });
    }
    throw new Error(`unexpected discovery request ${url}`);
  };

  const [fish, minimax, cartesia, elevenlabs, deepgram] = await Promise.all([
    fetchByokProviderModelIds(access, {
      name: "Fish Audio",
      baseUrl: "https://api.fish.audio/v1/tts/v1",
      apiKey: "fish-key",
    }, fetchImpl),
    fetchByokProviderModelIds(access, {
      name: "MiniMax",
      baseUrl: "https://api.minimax.io/v1",
      apiKey: "minimax-key",
    }, fetchImpl),
    fetchByokProviderModelIds(access, {
      name: "Cartesia",
      baseUrl: "https://api.cartesia.ai",
      apiKey: "cartesia-key",
    }, fetchImpl),
    fetchByokProviderModelIds(access, {
      name: "ElevenLabs",
      baseUrl: "https://api.elevenlabs.io/v1",
      apiKey: "eleven-key",
    }, fetchImpl),
    fetchByokProviderModelIds(access, {
      name: "Deepgram",
      baseUrl: "https://api.deepgram.com/v1",
      apiKey: "deepgram-key",
    }, fetchImpl),
  ]);

  assert.deepEqual(fish.models, [
    "s1",
    "s2-pro",
    "s2.1-pro",
    "s2.1-pro-free",
    "voice-design-1",
  ]);
  assert.ok(minimax.models.includes("speech-2.8-hd"));
  assert.ok(minimax.models.includes("voice-design"));
  assert.ok(cartesia.models.includes("sonic-3.6"));
  assert.deepEqual(elevenlabs.models, [
    "eleven_multilingual_v2",
    "eleven_ttv_v3",
  ]);
  assert.deepEqual(deepgram.models, [
    "aura-2-fujimi-ja",
    "aura-2-thalia-en",
  ]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.elevenlabs.io/v1/models");
  assert.equal(calls[0].headers.get("xi-api-key"), "eleven-key");
  assert.equal(calls[1].url, "https://api.deepgram.com/v1/models");
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
      return Response.json({
        data: [{
          id: "draft-model",
          operation: "video",
          supported_roles: ["VIDEO_TEXT_TO_VIDEO"],
          metadata: {
            capabilities: JSON.stringify({
              generation: {
                modes: ["TEXT_TO_VIDEO"],
                resolutions: ["720p", "1080p"],
                aspectRatios: ["16:9", "9:16"],
                minDuration: 4,
                maxDuration: 12,
              },
              request: {
                schema: {
                  type: "object",
                  properties: { seconds: { type: "integer", minimum: 4 } },
                },
              },
            }),
          },
        }],
      });
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://draft.example.test/v1/models");
  assert.equal(calls[0].headers.get("Authorization"), "Bearer draft-secret");
  assert.deepEqual(result.models, ["draft-model"]);
  assert.deepEqual(result.modelMetadata, [{
    id: "draft-model",
    capabilities: {
      operation: "VIDEO",
      generation: {
        modes: ["TEXT_TO_VIDEO"],
        resolutions: ["720p", "1080p"],
        aspectRatios: ["16:9", "9:16"],
        minDuration: 4,
        maxDuration: 12,
      },
      request: {
        schema: {
          type: "object",
          properties: { seconds: { type: "integer", minimum: 4 } },
        },
      },
      supportedModes: ["TEXT_TO_VIDEO"],
      supportedRoles: ["VIDEO_TEXT_TO_VIDEO"],
      resolutionOptions: ["720p", "1080p"],
      ratioOptions: ["16:9", "9:16"],
      aspectRatios: ["16:9", "9:16"],
      minDuration: 4,
      maxDuration: 12,
    },
    parameterSchema: {
      type: "object",
      properties: { seconds: { type: "integer", minimum: 4 } },
    },
  }]);
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
      ? Response.json({
          data: [{
            id: "models/claude-sonnet",
            context_window: 200000,
            supported_reasoning_efforts: ["low", "high"],
            default_reasoning_effort: "low",
          }],
        })
      : Response.json({
          models: [{
            name: "models/gemini-2.5-pro",
            inputTokenLimit: 1048576,
          }],
        });
  };

  const anthropic = await fetchByokProviderModelIds(
    access,
    "anthropic",
    fetchImpl,
  );
  const gemini = await fetchByokProviderModelIds(access, "gemini", fetchImpl);

  assert.deepEqual(anthropic.models, ["claude-sonnet"]);
  assert.deepEqual(gemini.models, ["gemini-2.5-pro"]);
  assert.deepEqual(anthropic.modelMetadata, [{
    id: "claude-sonnet",
    contextWindow: 200000,
    reasoningEfforts: ["low", "high"],
    defaultReasoningEffort: "low",
  }]);
  assert.deepEqual(gemini.modelMetadata, [{
    id: "gemini-2.5-pro",
    contextWindow: 1048576,
  }]);
  assert.equal(calls[0].url, "https://api.anthropic.test/v1/models");
  assert.equal(calls[0].headers.get("X-Api-Key"), "anthropic-key");
  assert.equal(calls[0].headers.get("Anthropic-Version"), "2023-06-01");
  assert.equal(
    calls[1].url,
    "https://generativelanguage.test/v1beta/models?pageSize=1000",
  );
  assert.equal(calls[1].headers.get("X-Goog-Api-Key"), "gemini-key");
});

test("native provider strategies validate their real model-role capabilities", async (t) => {
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

  await assert.rejects(store.configureByok({
    providerId: "fish",
    name: "Fish Audio",
    protocol: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.fish.audio/v1/tts/v1",
    apiKey: "secret",
    modelAssignments: [
      {
        modelId: "s2.1-pro-free",
        role: "AUDIO_VOICE_DESIGN",
        priority: 10,
        enabled: true,
      },
    ],
  }), /必须填写 voice-design-1/);

  const fish = await store.configureByok({
    providerId: "fish",
    name: "Fish Audio",
    protocol: "OPENAI_COMPATIBLE",
    baseUrl: "https://api.fish.audio/v1/tts/v1",
    apiKey: "secret",
    modelAssignments: [
      {
        modelId: "voice-design-1",
        role: "AUDIO_VOICE_DESIGN",
        priority: 10,
        enabled: true,
      },
    ],
  });
  assert.deepEqual(
    fish.byokProviders.find((provider) => provider.id === "fish")
      ?.modelAssignments,
    [
      {
        modelId: "voice-design-1",
        role: "AUDIO_VOICE_DESIGN",
        priority: 10,
        enabled: true,
      },
    ],
  );

  const configured = await store.configureByok({
    providerId: "gemini",
    protocol: "GEMINI",
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "secret",
    modelAssignments: [
      {
        modelId: "gemini-image",
        role: "IMAGE_GENERATION",
        priority: 10,
        enabled: true,
      },
      {
        modelId: "gemini-embedding-001",
        role: "EMBEDDING",
        priority: 20,
        enabled: true,
      },
    ],
  });
  assert.equal(
    configured.byokProviders
      .find((provider) => provider.id === "gemini")
      ?.baseUrl.endsWith("/v1beta"),
    true,
  );
  await assert.rejects(
    store.configureByok({
      providerId: "gemini",
      protocol: "GEMINI",
      baseUrl: "https://generativelanguage.googleapis.com",
      modelAssignments: [
        {
          modelId: "veo-preview",
          role: "VIDEO_TEXT_TO_VIDEO",
          priority: 10,
          enabled: true,
        },
      ],
    }),
    /不支持 VIDEO_TEXT_TO_VIDEO/,
  );
  await assert.rejects(
    store.configureByok({
      providerId: "token-plan",
      protocol: "OPENAI_COMPATIBLE",
      baseUrl:
        "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      apiKey: "secret",
      modelAssignments: [
        {
          modelId: "qwen-audio-3.0-tts-plus",
          role: "AUDIO_VOICE_DESIGN",
          priority: 10,
          enabled: true,
        },
      ],
    }),
    /Token Plan.*不能配置为音频、图像或视频用途/,
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
              capabilities: {
                resolutionOptions: ["720p"],
                ratioOptions: ["16:9"],
                minDuration: 4,
                maxDuration: 8,
                limits: { declared: true, retained: true },
              },
              capabilityOverrides: {
                resolutionOptions: ["1080p"],
                maxDuration: 12,
                limits: { declared: false },
              },
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
    resolutionOptions: ["1080p"],
    ratioOptions: ["16:9"],
    minDuration: 4,
    maxDuration: 12,
    limits: { declared: false, retained: true },
    supportedModes: ["FIRST_FRAME", "IMAGE_REFERENCE", "IMAGE_TO_VIDEO"],
    routeSelector: "byok:provider-one:video-model",
  });
});

test("BYOK text catalog projects discovered context and reasoning metadata", async () => {
  const catalog = await fetchByokModelCatalog({
    schemaVersion: 5,
    cloudModelAssignments: [],
    byokProviders: [{
      id: "provider-one",
      name: "Provider One",
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "https://models.example.test/v1",
      apiKey: "key",
      enabled: true,
      priority: 10,
      modelAssignments: [{
        modelId: "Qwen3.8-27B",
        role: "TEXT",
        priority: 10,
        enabled: true,
        parameterSchema: {
          type: "object",
          properties: {
            temperature: { type: "number", minimum: 0, maximum: 2 },
          },
        },
        contextWindow: 32768,
        reasoningEfforts: ["low", "medium", "xhigh"],
        defaultReasoningEffort: "low",
      }],
    }],
  }, "TEXT");

  assert.equal(
    JSON.parse(catalog.items[0].capabilityJson).contextWindowTokens,
    32768,
  );
  assert.deepEqual(
    JSON.parse(catalog.items[0].parameterSchemaJson).properties.reasoning_effort,
    {
      type: "string",
      enum: ["low", "medium", "xhigh"],
      default: "low",
    },
  );
  assert.deepEqual(
    JSON.parse(catalog.items[0].parameterSchemaJson).properties.temperature,
    { type: "number", minimum: 0, maximum: 2 },
  );
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
          { modelId: "designer", role: "AUDIO_VOICE_DESIGN", priority: 10, enabled: true },
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
        code: "designer",
        operation: "AUDIO_VOICE_DESIGN",
        modes: ["VOICE_DESIGN"],
      },
      {
        code: "image-edit",
        operation: "IMAGE",
        modes: ["IMAGE_TO_IMAGE"],
      },
    ],
  );
  const voiceDesign = catalog.items.find((item) => item.code === "designer");
  assert.ok(voiceDesign);
  assert.deepEqual(JSON.parse(voiceDesign.parameterSchemaJson), {
    type: "object",
    properties: {
      voice_prompt: { type: "string", maxLength: 2048 },
      preview_text: { type: "string", maxLength: 1024 },
      preferred_name: {
        type: "string",
        default: "custom_voice",
        maxLength: 16,
      },
      language: {
        type: "string",
        enum: ["zh", "en", "de", "it", "pt", "es", "ja", "ko", "fr", "ru"],
        default: "zh",
      },
      sample_rate: {
        type: "integer",
        enum: [8000, 16000, 24000, 48000],
        default: 24000,
      },
      response_format: {
        type: "string",
        enum: ["wav", "mp3"],
        default: "wav",
      },
    },
  });
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

test("assistant conversation override selects one exact route without changing global priority", async (t) => {
  const cloudCalls = [];
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
  const routing = {
    allowsCustomModels: true,
    cloudModelAssignments: [
      {
        modelId: "cloud-text",
        role: "TEXT",
        priority: 100,
        enabled: true,
        reasoningEfforts: ["high"],
      },
    ],
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "byok-first",
          name: "BYOK First",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: "http://127.0.0.1:1/v1",
          apiKey: "byok-key",
          enabled: true,
          priority: 1,
          modelAssignments: [
            { modelId: "byok-text", role: "TEXT", priority: 1, enabled: true },
          ],
        },
      ],
    },
  };
  proxy.configureRouting(routing);
  await proxy.start();
  t.after(() => proxy.stop());

  const selector = "cloud:cloud-text";
  const encodedSelector = Buffer.from(selector, "utf8").toString("base64url");
  const encodedEffort = Buffer.from("high", "utf8").toString("base64url");
  const response = await fetch(`${proxy.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Request-Surface": "ai-assistant",
    },
    body: JSON.stringify({
      model: `ai-anime-route:${encodedSelector}:reasoning-effort:${encodedEffort}`,
      messages: [],
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ai-anime-route-source"), "cloud");
  assert.equal(response.headers.get("x-ai-anime-route-model"), "cloud-text");
  assert.equal(cloudCalls.length, 1);
  assert.equal(JSON.parse(cloudCalls[0].body).reasoning_effort, "high");

  const encodedDisabledEffort = Buffer.from("none", "utf8").toString("base64url");
  const disabledRequest = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Request-Surface": "ai-assistant",
    },
    body: JSON.stringify({
      model: `ai-anime-route:${encodedSelector}:reasoning-effort:${encodedDisabledEffort}`,
      messages: [],
    }),
  };
  const rejectedDisabledResponse = await fetch(
    `${proxy.baseUrl}/chat/completions`,
    disabledRequest,
  );

  assert.equal(rejectedDisabledResponse.status, 422);
  assert.match(
    (await rejectedDisabledResponse.json()).error.message,
    /不支持所选思考力度/,
  );
  assert.equal(cloudCalls.length, 1);

  proxy.configureRouting({
    ...routing,
    cloudModelAssignments: routing.cloudModelAssignments.map((assignment) => ({
      ...assignment,
      reasoningEfforts: ["high", "none"],
    })),
  });
  const disabledResponse = await fetch(
    `${proxy.baseUrl}/chat/completions`,
    disabledRequest,
  );

  assert.equal(disabledResponse.status, 200);
  assert.equal(cloudCalls.length, 2);
  const disabledBody = JSON.parse(cloudCalls[1].body);
  assert.equal(disabledBody.reasoning_effort, "none");
  assert.equal(Object.hasOwn(disabledBody, "chat_template_kwargs"), false);
  assert.equal(Object.hasOwn(disabledBody, "include_reasoning"), false);
});

test("explicit cloud catalog video selection does not change global role priority", async (t) => {
  const cloudCalls = [];
  const routing = {
    allowsCustomModels: false,
    cloudModelAssignments: [
      {
        modelId: "video-seed-default",
        role: "VIDEO_IMAGE_TO_VIDEO",
        priority: 100,
        enabled: true,
      },
    ],
    explicitCloudModelAssignments: [
      {
        modelId: "video-seed-default",
        role: "VIDEO_IMAGE_TO_VIDEO",
        priority: 100,
        enabled: true,
      },
      {
        modelId: "MINIMAX_H3",
        role: "VIDEO_IMAGE_TO_VIDEO",
        priority: 100,
        enabled: true,
      },
    ],
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [],
    },
  };
  const proxy = new CommercialModelProxy(
    {
      async modelRequest(input) {
        const body = input.body ? JSON.parse(String(input.body)) : null;
        cloudCalls.push({ path: input.path, body });
        if (input.path === "/v1/videos") {
          return Response.json({ id: `task-${body.model}` });
        }
        return Response.json({ id: "task-MINIMAX_H3", status: "processing" });
      },
    },
    {
      async summary() {
        return { publicKeyHash: "device-public-key-hash" };
      },
    },
  );
  proxy.configureRouting(routing);
  await proxy.start();
  t.after(() => proxy.stop());

  const automatic = await fetch(`${proxy.baseUrl}/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Model-Role": "VIDEO_IMAGE_TO_VIDEO",
    },
    body: JSON.stringify({
      model: "router-placeholder",
      prompt: "automatic route",
      seconds: 5,
      size: "1280x720",
    }),
  });
  assert.equal(automatic.status, 200);
  assert.equal(
    automatic.headers.get("x-ai-anime-route-model"),
    "video-seed-default",
  );

  const explicit = await fetch(`${proxy.baseUrl}/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Model-Role": "VIDEO_IMAGE_TO_VIDEO",
      "X-AI-Anime-Model-Selector": "cloud:MINIMAX_H3",
    },
    body: JSON.stringify({
      model: "MINIMAX_H3",
      prompt: "manual route",
      seconds: 5,
      size: "1280x720",
    }),
  });
  assert.equal(explicit.status, 200);
  assert.equal(explicit.headers.get("x-ai-anime-route-model"), "MINIMAX_H3");

  proxy.configureRouting(routing);
  const poll = await fetch(`${proxy.baseUrl}/videos/task-MINIMAX_H3`, {
    headers: { Authorization: `Bearer ${proxy.token}` },
  });
  assert.equal(poll.status, 200);
  assert.equal(poll.headers.get("x-ai-anime-route-model"), "MINIMAX_H3");
  assert.deepEqual(
    cloudCalls.map((call) => ({
      path: call.path,
      model: call.body?.model ?? null,
    })),
    [
      { path: "/v1/videos", model: "video-seed-default" },
      { path: "/v1/videos", model: "MINIMAX_H3" },
      { path: "/v1/videos/task-MINIMAX_H3", model: null },
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

test("cloud authentication exceptions fall back before a write reaches the provider", async (t) => {
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
  const audit = [];
  const proxy = new CommercialModelProxy(
    {
      async modelRequest(input) {
        cloudCalls.push(input);
        throw new CommercialApiError("云端账户尚未登录", { status: 401 });
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
      { modelId: "cloud-text", role: "TEXT", priority: 10, enabled: true },
    ],
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "byok-second",
          name: "BYOK Second",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          apiKey: "byok-key",
          enabled: true,
          priority: 20,
          modelAssignments: [
            { modelId: "byok-text", role: "TEXT", priority: 20, enabled: true },
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
  assert.equal(response.headers.get("x-ai-anime-route-source"), "byok");
  assert.equal(response.headers.get("x-ai-anime-route-attempts"), "2");
  assert.equal(cloudCalls.length, 1);
  assert.deepEqual(providerCalls.map((call) => call.model), ["byok-text"]);
  assert.ok(
    audit.some(
      (entry) =>
        entry.event === "route_attempt" &&
        entry.source === "cloud" &&
        entry.status === 401 &&
        entry.outcome === "fallback",
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

test("mixed model proxy tries each route once before falling back by priority", async (t) => {
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
  assert.equal(response.headers.get("x-ai-anime-route-attempts"), "3");
  assert.equal((await response.json()).choices[0].message.content, "provider two ok");
  assert.deepEqual(cloudCalls.map((call) => call.body.model), ["cloud-text"]);
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

test("Gemini provider strategy translates embedding and image roles", async (t) => {
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
    if (request.url.includes(":embedContent")) {
      response.end(JSON.stringify({ embedding: { values: [0.1, 0.2] } }));
      return;
    }
    response.end(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: Buffer.from("gemini-image").toString("base64"),
                  },
                },
              ],
            },
          },
        ],
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
            {
              modelId: "gemini-embedding-001",
              role: "EMBEDDING",
              priority: 10,
              enabled: true,
            },
            {
              modelId: "gemini-image",
              role: "IMAGE_GENERATION",
              priority: 10,
              enabled: true,
            },
          ],
        },
      ],
    },
  });
  await proxy.start();
  t.after(() => proxy.stop());

  const embeddingResponse = await fetch(`${proxy.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Model-Selector":
        "byok:gemini:gemini-embedding-001",
    },
    body: JSON.stringify({ model: "ignored", input: "一段文本" }),
  });
  assert.equal(embeddingResponse.status, 200);
  assert.deepEqual((await embeddingResponse.json()).data, [
    { object: "embedding", index: 0, embedding: [0.1, 0.2] },
  ]);

  const imageResponse = await fetch(`${proxy.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Model-Selector": "byok:gemini:gemini-image",
    },
    body: JSON.stringify({ model: "ignored", prompt: "雨夜城市", size: "1280x720" }),
  });
  assert.equal(imageResponse.status, 200);
  assert.equal(
    (await imageResponse.json()).data[0].b64_json,
    Buffer.from("gemini-image").toString("base64"),
  );
  assert.equal(calls[0].apiKey, "gemini-secret");
  assert.equal(
    calls[0].path,
    "/v1beta/models/gemini-embedding-001:embedContent",
  );
  assert.equal(calls[1].path, "/v1beta/models/gemini-image:generateContent");
  assert.equal(
    calls[1].payload.generationConfig.responseFormat.image.aspectRatio,
    "16:9",
  );
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
  ], [
    {
      modelId: "cloud-video-standard",
      videoExtraParameterNames: [
        "steps",
        "seed",
        "turbo",
        "guidance_scale",
      ],
      videoSceneOptimizeOptions: ["anime", "realistic"],
      videoSupportsHumanReview: true,
    },
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
      mode: "TEXT_TO_VIDEO",
      seconds: "5",
      size: "1280x720",
      steps: 30,
      seed: 42,
      turbo: true,
      guidance_scale: 6.5,
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
    mode: "TEXT_TO_VIDEO",
    seconds: "5",
    size: "1280x720",
    steps: 30,
    seed: 42,
    turbo: true,
    guidance_scale: 6.5,
    generate_audio: true,
    human_review: true,
    scene_optimize: "anime",
  });

  const form = new FormData();
  form.append("model", "local-placeholder");
  form.append("prompt", "keep the character consistent");
  form.append("mode", "MULTIMODAL_REFERENCE");
  form.append("seconds", "8");
  form.append("size", "1080x1920");
  form.append("steps", "24");
  form.append("seed", "7");
  form.append("turbo", "false");
  form.append("generate_audio", "true");
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
  assert.equal(calls[1].body.get("mode"), "MULTIMODAL_REFERENCE");
  assert.equal(calls[1].body.get("steps"), "24");
  assert.equal(calls[1].body.get("seed"), "7");
  assert.equal(calls[1].body.get("turbo"), "false");
  assert.equal(calls[1].body.get("generate_audio"), "true");
  assert.equal(calls[1].body.get("human_review"), "true");
  assert.equal(calls[1].body.get("scene_optimize"), "anime");
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

test("BYOK voice design keeps the selected provider route and raw model code", async (t) => {
  const upstreamCalls = [];
  const providerServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    upstreamCalls.push({
      path: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    });
    response.statusCode = 200;
    response.setHeader("Content-Type", "audio/wav");
    response.setHeader("X-Voice-Id", "byok_voice_123");
    response.end(Buffer.from("designed-byok-voice"));
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
    {
      async modelRequest() {
        throw new Error("cloud route must not be used");
      },
    },
    {
      async summary() {
        return { publicKeyHash: "device-public-key-hash" };
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
          id: "voice-provider",
          name: "Voice Provider",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          apiKey: "voice-key",
          enabled: true,
          priority: 10,
          modelAssignments: [
            {
              modelId: "voice-design-model",
              role: "AUDIO_VOICE_DESIGN",
              priority: 10,
              enabled: true,
            },
          ],
        },
      ],
    },
  });
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Model-Role": "AUDIO_VOICE_DESIGN",
      "X-AI-Anime-Model-Selector": "byok:voice-provider:voice-design-model",
    },
    body: JSON.stringify({
      model: "byok:voice-provider:voice-design-model",
      mode: "VOICE_DESIGN",
      voice_prompt: "清澈温暖的青年女声",
      preview_text: "你好，这是声线试听。",
      language: "zh",
      sample_rate: 24000,
      response_format: "wav",
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ai-anime-route-source"), "byok");
  assert.equal(response.headers.get("x-voice-id"), "byok_voice_123");
  assert.deepEqual(upstreamCalls, [
    {
      path: "/v1/audio/speech",
      authorization: "Bearer voice-key",
      body: {
        model: "voice-design-model",
        mode: "VOICE_DESIGN",
        voice_prompt: "清澈温暖的青年女声",
        preview_text: "你好，这是声线试听。",
        language: "zh",
        sample_rate: 24000,
        response_format: "wav",
      },
    },
  ]);
});

test("Alibaba Model Studio maps Qwen-Audio voice design to the customization API", async (t) => {
  const upstreamCalls = [];
  const providerServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    upstreamCalls.push({
      path: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    });
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      output: {
        preview_audio: {
          data: Buffer.from("qwen-designed-audio").toString("base64"),
          sample_rate: 24000,
          response_format: "wav",
        },
        target_model: "qwen-audio-3.0-tts-plus",
        voice_id: "qwen-audio-designed-voice",
      },
      usage: { count: 1 },
      request_id: "qwen-request-1",
    }));
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
    {
      async modelRequest() {
        throw new Error("cloud route must not be used");
      },
    },
    {
      async summary() {
        return { publicKeyHash: "device-public-key-hash" };
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
          id: "qwen",
          name: "阿里云百炼",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `http://127.0.0.1:${address.port}/compatible-mode/v1`,
          apiKey: "qwen-key",
          enabled: true,
          priority: 10,
          modelAssignments: [
            {
              modelId: "qwen-audio-3.0-tts-plus",
              role: "AUDIO_VOICE_DESIGN",
              priority: 10,
              enabled: true,
            },
          ],
        },
      ],
    },
  });
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Model-Role": "AUDIO_VOICE_DESIGN",
      "X-AI-Anime-Model-Selector":
        "byok:qwen:qwen-audio-3.0-tts-plus",
    },
    body: JSON.stringify({
      model: "qwen-audio-3.0-tts-plus",
      mode: "VOICE_DESIGN",
      voice_prompt: "年轻清晰的中文女性声音，语气自然亲切",
      preview_text: "大家好，今天我们一起走进这段温暖而充满希望的校园故事。",
      preferred_name: "custom_voice",
      language: "zh",
      sample_rate: 24000,
      response_format: "wav",
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-ai-anime-route-source"), "byok");
  assert.equal(response.headers.get("x-request-id"), "qwen-request-1");
  assert.equal(response.headers.get("x-voice-id"), "qwen-audio-designed-voice");
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    Buffer.from("qwen-designed-audio"),
  );
  assert.deepEqual(upstreamCalls, [
    {
      path: "/api/v1/services/audio/tts/customization",
      authorization: "Bearer qwen-key",
      body: {
        model: "voice-enrollment",
        input: {
          action: "create_voice",
          target_model: "qwen-audio-3.0-tts-plus",
          voice_prompt: "年轻清晰的中文女性声音，语气自然亲切",
          preview_text: "大家好，今天我们一起走进这段温暖而充满希望的校园故事。",
          prefix: "customvoic",
          language_hints: ["zh"],
        },
        parameters: {
          sample_rate: 24000,
          response_format: "wav",
        },
      },
    },
  ]);
});

test("Fish Audio BYOK maps speech and voice design to the native contracts", async (t) => {
  const upstreamCalls = [];
  const providerServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    upstreamCalls.push({
      path: request.url,
      model: request.headers.model,
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    });
    response.statusCode = 200;
    if (request.url === "/v1/voice-design") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        candidates: [{
          id: "fish-designed-voice",
          audio_base64: Buffer.from("fish-designed-audio").toString("base64"),
          sample_rate: 24000,
        }],
      }));
      return;
    }
    response.setHeader("Content-Type", "audio/mpeg");
    response.end(Buffer.from("fish-speech"));
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
    {
      async modelRequest() {
        throw new Error("cloud route must not be used");
      },
    },
    {
      async summary() {
        return { publicKeyHash: "device-public-key-hash" };
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
          id: "fish",
          name: "Fish Audio",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `http://127.0.0.1:${address.port}/v1/tts/v1`,
          apiKey: "fish-key",
          enabled: true,
          priority: 10,
          modelAssignments: [
            {
              modelId: "s2.1-pro-free",
              role: "AUDIO_SPEECH",
              priority: 10,
              enabled: true,
            },
            {
              modelId: "voice-design-1",
              role: "AUDIO_VOICE_DESIGN",
              priority: 10,
              enabled: true,
            },
          ],
        },
      ],
    },
  });
  await proxy.start();
  t.after(() => proxy.stop());

  const selector = "byok:fish:s2.1-pro-free";
  const speechResponse = await fetch(`${proxy.baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Model-Role": "AUDIO_SPEECH",
      "X-AI-Anime-Model-Selector": selector,
    },
    body: JSON.stringify({
      model: selector,
      mode: "SPEECH",
      input: "你好，这是 Fish Audio 试听。",
      voice: "fish-voice-reference",
      speed: 1.1,
      response_format: "mp3",
    }),
  });
  assert.equal(speechResponse.status, 200);
  assert.equal(speechResponse.headers.get("x-ai-anime-route-source"), "byok");
  assert.deepEqual(upstreamCalls, [
    {
      path: "/v1/tts",
      model: "s2.1-pro-free",
      authorization: "Bearer fish-key",
      body: {
        text: "你好，这是 Fish Audio 试听。",
        format: "mp3",
        reference_id: "fish-voice-reference",
        prosody: { speed: 1.1 },
      },
    },
  ]);

  const designSelector = "byok:fish:voice-design-1";
  const designResponse = await fetch(`${proxy.baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "X-AI-Anime-Model-Role": "AUDIO_VOICE_DESIGN",
      "X-AI-Anime-Model-Selector": designSelector,
    },
    body: JSON.stringify({
      model: designSelector,
      mode: "VOICE_DESIGN",
      voice_prompt: "沉稳男声",
      preview_text: "你好。",
      language: "zh",
      sample_rate: 24000,
      response_format: "wav",
    }),
  });
  assert.equal(designResponse.status, 200);
  assert.equal(designResponse.headers.get("x-voice-id"), "fish-designed-voice");
  assert.deepEqual(Buffer.from(await designResponse.arrayBuffer()), Buffer.from("fish-designed-audio"));
  assert.deepEqual(upstreamCalls[1], {
    path: "/v1/voice-design",
    model: "voice-design-1",
    authorization: "Bearer fish-key",
    body: {
      instruction: "沉稳男声",
      reference_text: "你好。",
      language: "zh",
      n: 1,
    },
  });
});

test("audio strategy factory maps MiniMax, ElevenLabs, Deepgram, Cartesia, and OpenAI contracts", async (t) => {
  const upstreamCalls = [];
  const providerServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const bodyText = Buffer.concat(chunks).toString("utf8");
    upstreamCalls.push({
      path: request.url,
      authorization: request.headers.authorization,
      elevenKey: request.headers["xi-api-key"],
      cartesiaVersion: request.headers["cartesia-version"],
      body: bodyText ? JSON.parse(bodyText) : null,
    });
    response.statusCode = 200;
    if (request.url === "/v1/t2a_v2") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        data: { audio: Buffer.from("minimax-speech").toString("hex"), status: 2 },
        base_resp: { status_code: 0, status_msg: "success" },
      }));
      return;
    }
    if (request.url === "/v1/voice_design") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        trial_audio: Buffer.from("minimax-design").toString("hex"),
        voice_id: "minimax-designed-voice",
        base_resp: { status_code: 0, status_msg: "success" },
      }));
      return;
    }
    if (request.url.startsWith("/v1/text-to-voice/design")) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        previews: [{
          audio_base_64: Buffer.from("eleven-design").toString("base64"),
          generated_voice_id: "eleven-designed-voice",
          media_type: "audio/mpeg",
        }],
      }));
      return;
    }
    response.setHeader("Content-Type", "audio/mpeg");
    response.end(Buffer.from(`audio:${request.url}`));
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
  const origin = `http://127.0.0.1:${address.port}`;

  const proxy = new CommercialModelProxy(
    {
      async modelRequest() {
        throw new Error("cloud route must not be used");
      },
    },
    {
      async summary() {
        return { publicKeyHash: "device-public-key-hash" };
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
          id: "minimax",
          name: "MiniMax",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `${origin}/v1/t2a_v2`,
          apiKey: "minimax-key",
          enabled: true,
          priority: 10,
          modelAssignments: [
            { modelId: "speech-2.8-hd", role: "AUDIO_SPEECH", priority: 10, enabled: true },
            { modelId: "voice-design", role: "AUDIO_VOICE_DESIGN", priority: 10, enabled: true },
          ],
        },
        {
          id: "eleven",
          name: "ElevenLabs",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `${origin}/v1/text-to-speech`,
          apiKey: "eleven-key",
          enabled: true,
          priority: 20,
          modelAssignments: [
            { modelId: "eleven_multilingual_v2", role: "AUDIO_SPEECH", priority: 20, enabled: true },
            { modelId: "eleven_ttv_v3", role: "AUDIO_VOICE_DESIGN", priority: 20, enabled: true },
          ],
        },
        {
          id: "deepgram",
          name: "Deepgram",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `${origin}/v1/speak`,
          apiKey: "deepgram-key",
          enabled: true,
          priority: 30,
          modelAssignments: [
            { modelId: "aura-2-thalia-en", role: "AUDIO_SPEECH", priority: 30, enabled: true },
          ],
        },
        {
          id: "cartesia",
          name: "Cartesia",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `${origin}/tts/bytes`,
          apiKey: "cartesia-key",
          enabled: true,
          priority: 40,
          modelAssignments: [
            { modelId: "sonic-3.6", role: "AUDIO_SPEECH", priority: 40, enabled: true },
          ],
        },
        {
          id: "openai",
          name: "OpenAI",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `${origin}/v1/audio/speech`,
          apiKey: "openai-key",
          enabled: true,
          priority: 50,
          modelAssignments: [
            { modelId: "gpt-4o-mini-tts", role: "AUDIO_SPEECH", priority: 50, enabled: true },
          ],
        },
      ],
    },
  });
  await proxy.start();
  t.after(() => proxy.stop());

  const invoke = async (providerId, modelId, role, body) => {
    const response = await fetch(`${proxy.baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${proxy.token}`,
        "Content-Type": "application/json",
        "X-AI-Anime-Model-Role": role,
        "X-AI-Anime-Model-Selector": `byok:${providerId}:${modelId}`,
      },
      body: JSON.stringify({ model: modelId, ...body }),
    });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    return response;
  };

  await invoke("minimax", "speech-2.8-hd", "AUDIO_SPEECH", {
    mode: "SPEECH",
    input: "MiniMax speech",
    voice: "Chinese (Mandarin)_News_Anchor",
    speed: 1.1,
    response_format: "mp3",
  });
  const minimaxDesign = await invoke(
    "minimax",
    "voice-design",
    "AUDIO_VOICE_DESIGN",
    {
      mode: "VOICE_DESIGN",
      voice_prompt: "沉稳、清晰的中文男声",
      preview_text: "这是一段 MiniMax 声线试听。",
      response_format: "mp3",
    },
  );
  assert.equal(minimaxDesign.headers.get("x-voice-id"), "minimax-designed-voice");
  await invoke("eleven", "eleven_multilingual_v2", "AUDIO_SPEECH", {
    mode: "SPEECH",
    input: "ElevenLabs speech",
    voice: "eleven-voice-id",
    speed: 1,
    response_format: "mp3",
  });
  const elevenDesign = await invoke(
    "eleven",
    "eleven_ttv_v3",
    "AUDIO_VOICE_DESIGN",
    {
      mode: "VOICE_DESIGN",
      voice_prompt: "A warm and expressive narrator voice for an animated drama.",
      preview_text: "This is a deliberately long preview sentence for the ElevenLabs voice design contract. It contains more than one hundred characters so the upstream API accepts it.",
      response_format: "mp3",
    },
  );
  assert.equal(elevenDesign.headers.get("x-voice-id"), "eleven-designed-voice");
  await invoke("deepgram", "aura-2-thalia-en", "AUDIO_SPEECH", {
    mode: "SPEECH",
    input: "Deepgram speech",
    speed: 0.9,
    response_format: "wav",
  });
  await invoke("cartesia", "sonic-3.6", "AUDIO_SPEECH", {
    mode: "SPEECH",
    input: "Cartesia speech",
    voice: "cartesia-voice-id",
    speed: 1.2,
    response_format: "wav",
  });
  await invoke("openai", "gpt-4o-mini-tts", "AUDIO_SPEECH", {
    mode: "SPEECH",
    input: "OpenAI speech",
    voice: "alloy",
    speed: 1,
    response_format: "mp3",
  });

  assert.deepEqual(upstreamCalls[0].body, {
    model: "speech-2.8-hd",
    text: "MiniMax speech",
    stream: false,
    output_format: "hex",
    language_boost: "auto",
    voice_setting: {
      voice_id: "Chinese (Mandarin)_News_Anchor",
      speed: 1.1,
      vol: 1,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1,
    },
  });
  assert.deepEqual(upstreamCalls[1].body, {
    prompt: "沉稳、清晰的中文男声",
    preview_text: "这是一段 MiniMax 声线试听。",
  });
  assert.equal(upstreamCalls[2].elevenKey, "eleven-key");
  assert.match(upstreamCalls[2].path, /^\/v1\/text-to-speech\/eleven-voice-id\?/);
  assert.equal(upstreamCalls[4].authorization, "Token deepgram-key");
  assert.match(upstreamCalls[4].path, /^\/v1\/speak\?model=aura-2-thalia-en/);
  assert.equal(upstreamCalls[5].cartesiaVersion, "2026-08-14");
  assert.deepEqual(upstreamCalls[6].body, {
    model: "gpt-4o-mini-tts",
    input: "OpenAI speech",
    voice: "alloy",
    response_format: "mp3",
    speed: 1,
  });
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

test("local model proxy replays all 533 OpenAI-compatible SSE events through DONE", async (t) => {
  const expectedContent = [
    "我是 AI anime 助手，当前运行的模型是 **Qwen（QWEN3_8_27B）**，由自定义接入方（custom provider）提供。",
    "关于上下文大小：我这边没有直接的精确数字。按 Qwen 这个级别的模型通常配置来看，上下文窗口一般在 **128K token** 左右，具体以你部署侧实际拉起的参数为准。",
    "如果你需要精确的上下文上限，可以在你的部署/接入配置里查一下模型启动参数中的 `max_model_len` 或 `context_length` 字段，那个值才是权威来源。",
    "服务端这边我继续处理 PUBLIC_HTTP 的 Bearer Key、三个远程入口鉴权、HTTPS 域名与生产配置，不再扫描客户端仓库。",
  ].join("\n\n");
  const contentCharacters = Array.from(expectedContent);
  const contentParts = Array.from({ length: 91 }, (_, index) => {
    const start = Math.floor(index * contentCharacters.length / 91);
    const end = Math.floor((index + 1) * contentCharacters.length / 91);
    return contentCharacters.slice(start, end).join("");
  });
  const reasoningParts = Array.from(
    { length: 438 },
    (_, index) => `思考片段-${index.toString().padStart(3, "0")};`,
  );
  const chunkEvent = (delta, finishReason = null) => `data: ${JSON.stringify({
    id: "5989b3d6-4914-4a62-ba4d-8a83622443ae",
    object: "chat.completion.chunk",
    model: "QWEN3_8_27B",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
  const events = [
    chunkEvent({ role: "assistant" }),
    ...reasoningParts.map((reasoningContent) =>
      chunkEvent({ reasoning_content: reasoningContent })
    ),
    ...contentParts.map((content) => chunkEvent({ content })),
    chunkEvent({}, "stop"),
    `data: ${JSON.stringify({
      id: "5989b3d6-4914-4a62-ba4d-8a83622443ae",
      object: "chat.completion.chunk",
      model: "QWEN3_8_27B",
      choices: [],
      usage: { prompt_tokens: 12, completion_tokens: 533, total_tokens: 545 },
    })}\n\n`,
    "data: [DONE]\n\n",
  ];
  assert.equal(events.length, 533);

  const client = {
    async modelRequest() {
      let eventIndex = 0;
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        pull(controller) {
          const event = events[eventIndex];
          if (event === undefined) {
            controller.close();
            return;
          }
          eventIndex += 1;
          controller.enqueue(encoder.encode(event));
        },
      }), {
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
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
  assert.equal(response.status, 200);
  assert.ok(response.body);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let replay = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    replay += decoder.decode(value, { stream: true });
  }
  replay += decoder.decode();

  const replayedEvents = replay.split(/\r?\n\r?\n/u).filter(Boolean);
  assert.equal(replayedEvents.length, 533);
  let content = "";
  let reasoningContent = "";
  let finishReason = null;
  let doneSeen = false;
  for (const event of replayedEvents) {
    assert.match(event, /^data: /u);
    const data = event.slice("data: ".length);
    if (data === "[DONE]") {
      doneSeen = true;
      continue;
    }
    const payload = JSON.parse(data);
    const choice = payload.choices?.[0];
    reasoningContent += choice?.delta?.reasoning_content ?? "";
    content += choice?.delta?.content ?? "";
    finishReason = choice?.finish_reason ?? finishReason;
  }

  assert.equal(doneSeen, true);
  assert.equal(replayedEvents.at(-1), "data: [DONE]");
  assert.equal(finishReason, "stop");
  assert.equal(reasoningContent, reasoningParts.join(""));
  assert.equal(content, expectedContent);
  assert.match(content, /custom provider）提供。\n\n关于上下文大小/u);
  assert.match(content, /context_length` 字段.*\n\n服务端这边/u);
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
    gatewayOrigin: "https://aianime.mingcw.com",
    accessToken: "old-client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user,
    tenant,
  };
  const calls = [];
  let modelAttempts = 0;
  const client = new CommercialApiClient({
    baseUrl: "https://aianime.mingcw.com",
    sessionStore: store,
    fetchImpl: async (url, init) => {
      const call = { url: String(url), init };
      calls.push(call);
      if (call.url.includes("/api/v1/client/licenses/current")) {
        return Response.json(authorizationFixture());
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
  assert.equal(firstHeaders.get("X-Device-Id"), TEST_IDS.device);
  assert.equal(secondHeaders.get("X-Device-Id"), TEST_IDS.device);
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
    gatewayOrigin: "https://aianime.mingcw.com",
    accessToken: "client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user,
    tenant,
  };
  const calls = [];
  let modelAttempts = 0;
  const client = new CommercialApiClient({
    baseUrl: "https://aianime.mingcw.com",
    sessionStore: store,
    fetchImpl: async (url, init) => {
      const call = { url: String(url), init };
      calls.push(call);
      if (call.url.includes("/api/v1/client/licenses/current")) {
        return Response.json(authorizationFixture());
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

test("DELETE cloud model mutations keep one idempotency key and are not replayed", async (t) => {
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://aianime.mingcw.com",
    accessToken: "client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user,
    tenant,
  };
  const calls = [];
  const client = new CommercialApiClient({
    baseUrl: "https://aianime.mingcw.com",
    sessionStore: store,
    fetchImpl: async (url, init) => {
      const call = { url: String(url), init };
      calls.push(call);
      if (call.url.includes("/api/v1/client/licenses/current")) {
        return Response.json(authorizationFixture());
      }
      if (call.url.endsWith("/v1/videos/video-42")) {
        return new Response("gateway timeout", { status: 504 });
      }
      throw new Error(`unexpected request ${call.url}`);
    },
  });
  const proxy = new CommercialModelProxy(client, {
    async summary() {
      return {
        schemaVersion: 1,
        publicKey: "public-key",
        publicKeyHash: "device-public-key-hash",
      };
    },
  });
  configureCloudProxy(proxy, [
    { modelId: "cloud-video", role: "VIDEO_TEXT_TO_VIDEO" },
  ]);
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/videos/video-42`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${proxy.token}` },
  });

  assert.equal(response.status, 504);
  const modelCalls = calls.filter((call) =>
    call.url.endsWith("/v1/videos/video-42"),
  );
  assert.equal(modelCalls.length, 1);
  assert.equal(modelCalls[0].init.method, "DELETE");
  assert.match(
    new Headers(modelCalls[0].init.headers).get("Idempotency-Key"),
    /^[0-9a-f-]{36}$/,
  );
});

test("cloud model catalog reads send the activated device and retry transient failures", async () => {
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://aianime.mingcw.com",
    accessToken: "client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user,
    tenant,
  };
  let modelAttempts = 0;
  const modelHeaders = [];
  const client = new CommercialApiClient({
    baseUrl: "https://aianime.mingcw.com",
    sessionStore: store,
    fetchImpl: async (url, init) => {
      const target = String(url);
      if (target.includes("/api/v1/client/licenses/current")) {
        return Response.json(authorizationFixture());
      }
      if (target.endsWith("/v1/models")) {
        modelAttempts += 1;
        modelHeaders.push(new Headers(init.headers));
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
  assert.equal(
    modelHeaders.every((headers) => headers.get("X-Device-Id") === TEST_IDS.device),
    true,
  );
});

test("model proxy owns cloud read retries without multiplying client retries", async (t) => {
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://aianime.mingcw.com",
    accessToken: "client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user,
    tenant,
  };
  let modelAttempts = 0;
  const client = new CommercialApiClient({
    baseUrl: "https://aianime.mingcw.com",
    sessionStore: store,
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes("/api/v1/client/licenses/current")) {
        return Response.json(authorizationFixture());
      }
      if (target.endsWith("/v1/models")) {
        modelAttempts += 1;
        return new Response("gateway timeout", { status: 504 });
      }
      throw new Error(`unexpected request ${target}`);
    },
  });
  const proxy = new CommercialModelProxy(client, {
    async summary() {
      return {
        schemaVersion: 1,
        publicKey: "public-key",
        publicKeyHash: "device-public-key-hash",
      };
    },
  });
  configureCloudProxy(proxy, [{ modelId: "cloud-text", role: "TEXT" }]);
  await proxy.start();
  t.after(() => proxy.stop());

  const response = await fetch(`${proxy.baseUrl}/v1/models`, {
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "X-AI-Anime-Model-Role": "TEXT",
    },
  });

  assert.equal(response.status, 504);
  assert.equal(response.headers.get("x-ai-anime-route-attempts"), "3");
  assert.equal(modelAttempts, 3);
  await response.text();
});

test("cloud model transport validates protocol-specific request headers", async () => {
  const store = new MemorySessionStore();
  store.value = {
    schemaVersion: 1,
    gatewayOrigin: "https://aianime.mingcw.com",
    accessToken: "client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user,
    tenant,
  };
  const calls = [];
  const client = new CommercialApiClient({
    baseUrl: "https://aianime.mingcw.com",
    sessionStore: store,
    fetchImpl: async (url, init) => {
      const call = { url: String(url), init };
      calls.push(call);
      if (call.url.includes("/api/v1/client/licenses/current")) {
        return Response.json(authorizationFixture());
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
    gatewayOrigin: "https://aianime.mingcw.com",
    accessToken: "client-jwt",
    expiresAtEpochMs: Date.now() + 3_600_000,
    user,
    tenant,
  };
  const client = new CommercialApiClient({
    baseUrl: "https://aianime.mingcw.com",
    sessionStore: store,
    fetchImpl: async () => Response.json({ ok: true }),
  });

  await assert.rejects(
    client.modelRequest({
      method: "GET",
      path: "",
      devicePublicKeyHash: "device-public-key-hash",
    }),
    (error) => error instanceof CommercialApiError && error.status === 400,
  );
  await assert.rejects(
    client.modelRequest({
      method: "GET",
      path: "https://bypass.example/v1/models",
      devicePublicKeyHash: "device-public-key-hash",
    }),
    (error) => error instanceof CommercialApiError && error.status === 400,
  );
  await assert.rejects(
    client.modelRequest({
      method: "GET",
      path: "/v1/models?api_key=bypass-secret",
      devicePublicKeyHash: "device-public-key-hash",
    }),
    (error) =>
      error instanceof CommercialApiError &&
      error.status === 400 &&
      /禁止查询参数/.test(error.message),
  );
  await assert.rejects(
    client.modelRequest({
      method: "GET",
      path: "/v1beta/models?key=gemini-bypass-secret",
      devicePublicKeyHash: "device-public-key-hash",
    }),
    (error) =>
      error instanceof CommercialApiError &&
      error.status === 400 &&
      /禁止查询参数/.test(error.message),
  );
});
