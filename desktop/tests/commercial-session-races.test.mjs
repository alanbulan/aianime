import assert from "node:assert/strict";
import test from "node:test";

import { CommercialApiClient } from "../src/commercial.ts";
import { CommercialModelProxy } from "../src/commercial-model-proxy.ts";
import { InMemoryModelInvocationStore } from "../src/commercial-model-invocation-store.ts";

class MemoryStore {
  value = null;
  async load() { return structuredClone(this.value); }
  async save(value) { this.value = structuredClone(value); }
  async clear() { this.value = null; }
}

const accountA = {
  accessToken: "account-a-token", expiresIn: 3600,
  user: { id: 1001, username: "alice", nickname: "甲", email: "a@example.test", avatar: "" },
  tenant: { id: 11, code: "tenant-a", name: "租户甲", isSystem: false },
};
const accountB = {
  accessToken: "account-b-token", expiresIn: 3600,
  user: { ...accountA.user, id: 2002, username: "bob", nickname: "乙" },
  tenant: { ...accountA.tenant, id: 22, code: "tenant-b", name: "租户乙" },
};
const profileFor = (account) => ({
  ...account.user, phone: "", gender: 0, status: 1, deptId: 0, deptName: "", profileDescription: "",
});
const login = (client, account) => client.login({
  loginType: "PASSWORD", tenantCode: account.tenant.code, username: account.user.username,
  password: "test-password", rememberMe: true,
});
const sessionChanged = (error) => error?.code === "SESSION_CHANGED";

function fixture(handle) {
  const sessionStore = new MemoryStore();
  const rememberedLoginStore = new MemoryStore();
  let now = 1000;
  const client = new CommercialApiClient({
    baseUrl: "https://gateway.test", sessionStore, rememberedLoginStore, now: () => now,
    fetchImpl: async (url, init) => {
      const path = new URL(url).pathname;
      const custom = await handle?.(path, init);
      if (custom) return custom;
      if (path === "/api/v1/client/auth/login") {
        return Response.json(JSON.parse(init.body).username === "alice" ? accountA : accountB);
      }
      if (path === "/api/v1/client/auth/logout") return Response.json({ success: true });
      if (path === "/api/v1/user/profile" && init.method === "GET") {
        return Response.json(profileFor(new Headers(init.headers).get("authorization")?.includes("account-b") ? accountB : accountA));
      }
      throw new Error(`unexpected mock route: ${init.method} ${path}`);
    },
  });
  return { client, sessionStore, rememberedLoginStore, setNow: (value) => { now = value; } };
}

for (const operation of ["profile", "model"]) {
  for (const replacement of [accountB, accountA]) {
    test(`${operation}: an old 401 cannot replay after logging in as ${replacement.user.username}`, async () => {
      const started = Promise.withResolvers();
      const response = Promise.withResolvers();
      const tokens = [];
      const { client, sessionStore } = fixture(async (path, init) => {
        if ((path === "/api/v1/user/profile" && init.method === "PUT") || path === "/v1/images/generations") {
          tokens.push(new Headers(init.headers).get("authorization"));
          started.resolve();
          return response.promise;
        }
      });
      await login(client, accountA);
      client.activeDeviceId = "22222222-2222-4222-8222-222222222222";
      const request = operation === "profile"
        ? client.updateProfile({ nickname: "旧修改", email: "", phone: "", gender: 0, profileDescription: "" })
        : client.modelRequest({ method: "POST", path: "/v1/images/generations", body: "{}", devicePublicKeyHash: "test-device" });
      const rejected = assert.rejects(request, sessionChanged);
      await started.promise;
      await client.logout();
      await login(client, replacement);
      response.resolve(Response.json({ message: "expired" }, { status: 401 }));
      await rejected;
      assert.deepEqual(tokens, ["Bearer account-a-token"]);
      assert.equal(sessionStore.value.user.id, replacement.user.id);
      assert.equal((await client.restoreSession()).user.id, replacement.user.id);
    });
  }
}

test("a second 401 cannot clear the account logged in while the retry was pending", async () => {
  const started = Promise.withResolvers();
  const response = Promise.withResolvers();
  let attempts = 0;
  const { client, sessionStore } = fixture(async (path, init) => {
    if (path === "/api/v1/client/auth/refresh") return Response.json({ accessToken: "refreshed-a", expiresIn: 3600 });
    if (path === "/api/v1/user/profile" && init.method === "GET") {
      if (++attempts === 1) return Response.json({}, { status: 401 });
      started.resolve();
      return response.promise;
    }
  });
  await login(client, accountA);
  const rejected = assert.rejects(client.currentProfile(), sessionChanged);
  await started.promise;
  await client.logout();
  await login(client, accountB);
  response.resolve(Response.json({}, { status: 401 }));
  await rejected;
  assert.equal(sessionStore.value.accessToken, accountB.accessToken);
  assert.equal(attempts, 2);
});

test("a 401 refresh still retries within the same login", async () => {
  const tokens = [];
  const { client, sessionStore } = fixture(async (path, init) => {
    if (path === "/api/v1/client/auth/refresh") return Response.json({ accessToken: "refreshed-a", expiresIn: 3600 });
    if (path === "/api/v1/user/profile") {
      tokens.push(new Headers(init.headers).get("authorization"));
      return tokens.length === 1 ? Response.json({}, { status: 401 }) : Response.json(profileFor(accountA));
    }
  });
  await login(client, accountA);
  assert.equal((await client.currentProfile()).id, accountA.user.id);
  assert.deepEqual(tokens, ["Bearer account-a-token", "Bearer refreshed-a"]);
  assert.equal(sessionStore.value.accessToken, "refreshed-a");
});

for (const switchAccount of [false, true]) {
  test(`refresh completion after logout does not restore A (replacement=${switchAccount})`, async () => {
    const started = Promise.withResolvers();
    const response = Promise.withResolvers();
    const { client, sessionStore, rememberedLoginStore, setNow } = fixture(async (path) => {
      if (path === "/api/v1/client/auth/refresh") { started.resolve(); return response.promise; }
    });
    await login(client, accountA);
    setNow(3_601_000);
    const restore = client.restoreSession();
    await started.promise;
    await client.logout();
    if (switchAccount) await login(client, accountB);
    response.resolve(Response.json({ accessToken: "obsolete-refresh-a", expiresIn: 3600 }));
    assert.equal(await restore, null);
    assert.equal(sessionStore.value?.user.id ?? null, switchAccount ? accountB.user.id : null);
    assert.equal(rememberedLoginStore.value.username, switchAccount ? "bob" : "alice");
  });
}

test("new-account refresh does not join an older account's in-flight refresh", async () => {
  const startedA = Promise.withResolvers();
  const responseA = Promise.withResolvers();
  const { client, sessionStore, setNow } = fixture(async (path, init) => {
    if (path === "/api/v1/client/auth/refresh") {
      if (new Headers(init.headers).get("authorization") === "Bearer account-a-token") {
        startedA.resolve();
        return responseA.promise;
      }
      return Response.json({ accessToken: "refreshed-b", expiresIn: 3600 });
    }
  });
  await login(client, accountA);
  setNow(3_601_000);
  const oldRestore = client.restoreSession();
  await startedA.promise;
  await client.logout();
  await login(client, accountB);
  setNow(7_201_000);
  assert.equal((await client.restoreSession()).user.id, accountB.user.id);
  responseA.resolve(Response.json({ accessToken: "obsolete-a", expiresIn: 3600 }));
  assert.equal(await oldRestore, null);
  assert.equal(sessionStore.value.accessToken, "refreshed-b");
});

test("remembered reauthentication cannot overwrite a newer login", async () => {
  const started = Promise.withResolvers();
  const response = Promise.withResolvers();
  let loginCount = 0;
  const { client, sessionStore, rememberedLoginStore, setNow } = fixture(async (path, init) => {
    if (path === "/api/v1/client/auth/refresh") return Response.json({}, { status: 401 });
    if (path === "/api/v1/client/auth/login" && JSON.parse(init.body).username === "alice" && ++loginCount === 2) {
      started.resolve();
      return response.promise;
    }
  });
  await login(client, accountA);
  setNow(3_601_000);
  const restore = client.restoreSession();
  await started.promise;
  await client.logout();
  await login(client, accountB);
  response.resolve(Response.json({ ...accountA, accessToken: "reauthenticated-a" }));
  assert.equal(await restore, null);
  assert.equal(sessionStore.value.user.id, accountB.user.id);
  assert.equal(rememberedLoginStore.value.username, "bob");
});

test("a profile received for A cannot update B's stored identity", async () => {
  const started = Promise.withResolvers();
  const response = Promise.withResolvers();
  const { client, sessionStore } = fixture(async (path) => {
    if (path === "/api/v1/user/profile") { started.resolve(); return response.promise; }
  });
  await login(client, accountA);
  const rejected = assert.rejects(client.currentProfile(), sessionChanged);
  await started.promise;
  await client.logout();
  await login(client, accountB);
  response.resolve(Response.json(profileFor(accountA)));
  await rejected;
  assert.equal(await client.modelInvocationSubject(), "https://gateway.test|22|2002");
  assert.equal(sessionStore.value.user.id, accountB.user.id);
});

test("logout clears a refresh already writing to disk, including after restart", async () => {
  const writing = Promise.withResolvers();
  const releaseWrite = Promise.withResolvers();
  const { client, sessionStore, setNow } = fixture(async (path) => {
    if (path === "/api/v1/client/auth/refresh") return Response.json({ accessToken: "slow-save-a", expiresIn: 3600 });
  });
  await login(client, accountA);
  const save = sessionStore.save.bind(sessionStore);
  sessionStore.save = async (value) => {
    if (value.accessToken === "slow-save-a") { writing.resolve(); await releaseWrite.promise; }
    await save(value);
  };
  setNow(3_601_000);
  const restore = client.restoreSession();
  await writing.promise;
  const logout = client.logout();
  await Promise.resolve();
  assert.equal(await client.restoreSession(), null);
  releaseWrite.resolve();
  await logout;
  assert.equal(await restore, null);
  const restarted = new CommercialApiClient({ baseUrl: "https://gateway.test", sessionStore });
  assert.equal(await restarted.restoreSession(), null);
});

test("remote logout completion cannot clear a newly logged-in account", async () => {
  const started = Promise.withResolvers();
  const response = Promise.withResolvers();
  const { client, sessionStore } = fixture(async (path) => {
    if (path === "/api/v1/client/auth/logout") { started.resolve(); return response.promise; }
  });
  await login(client, accountA);
  const logout = client.logout();
  await started.promise;
  assert.equal(await client.restoreSession(), null);
  await login(client, accountB);
  response.resolve(Response.json({ success: true }));
  await logout;
  assert.equal(sessionStore.value.user.id, accountB.user.id);
});

const meteredQuote = () => ({
  id: "11111111-1111-4111-8111-111111111111", billingVersion: "METERED_V2",
  policyId: "22222222-2222-4222-8222-222222222222", policyVersion: 1,
  modelCode: "cloud-test", publicModelName: "测试模型", estimatedMicroPoints: "1000000",
  maximumMicroPoints: "2000000", tenantMultiplier: "1", requestHash: "a".repeat(64),
  expiresAt: new Date(Date.now() + 300000).toISOString(), status: "QUOTED", estimateOnly: true,
});

for (const pauseAt of ["device", "confirmation", "claim"]) {
  for (const replacement of [accountB, accountA]) {
    test(`proxy rejects an old intent after ${pauseAt} awaits and ${replacement.user.username} logs in`, { timeout: 15000 }, async (t) => {
      const started = Promise.withResolvers();
      const resume = Promise.withResolvers();
      const modelTokens = [];
      const { client, sessionStore } = fixture(async (path, init) => {
        if (path.startsWith("/api/v1/client/quota/protocol-quotes/")) return Response.json(meteredQuote());
        if (path.startsWith("/v1/")) {
          modelTokens.push(new Headers(init.headers).get("authorization"));
          return Response.json({ choices: [], data: [] });
        }
      });
      await login(client, accountA);
      client.activeDeviceId = "22222222-2222-4222-8222-222222222222";
      const invocationStore = new InMemoryModelInvocationStore();
      if (pauseAt === "claim") {
        const claim = invocationStore.claim.bind(invocationStore);
        invocationStore.claim = async (input) => {
          const result = await claim(input);
          started.resolve();
          await resume.promise;
          return result;
        };
      }
      const proxy = new CommercialModelProxy(client, {
        async summary() {
          if (pauseAt === "device") { started.resolve(); await resume.promise; }
          return { publicKeyHash: "test-device" };
        },
      }, undefined, {
        invocationStore, clientVersion: "1.1.84",
        confirmMeteredBudget: async () => {
          if (pauseAt === "confirmation") { started.resolve(); await resume.promise; }
          return true;
        },
      });
      const image = pauseAt === "claim";
      proxy.configureRouting({
        allowsCustomModels: false,
        access: { schemaVersion: 5, cloudModelAssignments: [], byokProviders: [] },
        cloudModelAssignments: [{ modelId: "cloud-test", role: image ? "IMAGE_GENERATION" : "TEXT", priority: 1, enabled: true }],
        modelCapabilities: [{ modelId: "cloud-test", billingVersion: "METERED_V2", quoteRequired: true, pricingAvailable: true }],
      });
      await proxy.start();
      t.after(async () => { resume.resolve(); await proxy.stop(); });
      const pending = fetch(`${proxy.baseUrl}/${image ? "images/generations" : "chat/completions"}`, {
        method: "POST", headers: { Authorization: `Bearer ${proxy.token}`, "Content-Type": "application/json", "Idempotency-Key": "old-intent" },
        body: JSON.stringify(image ? { model: "cloud-test", prompt: "frame" } : { model: "cloud-test", messages: [{ role: "user", content: "hello" }] }),
      });
      await Promise.race([
        started.promise,
        pending.then((response) => {
          assert.fail(`proxy completed before ${pauseAt}: HTTP ${response.status}`);
        }),
      ]);
      await client.logout();
      await login(client, replacement);
      client.activeDeviceId = "22222222-2222-4222-8222-222222222222";
      resume.resolve();
      const response = await pending;
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, "SESSION_CHANGED");
      assert.deepEqual(modelTokens, []);
      assert.equal(sessionStore.value.user.id, replacement.user.id);
    });
  }
}

test("quote device-scope completion cannot start a quote with a newer account", async () => {
  const started = Promise.withResolvers();
  const resume = Promise.withResolvers();
  let quoteCalls = 0;
  const { client } = fixture(async (path) => {
    if (path.startsWith("/api/v1/client/quota/protocol-quotes/")) { quoteCalls++; return Response.json(meteredQuote()); }
  });
  await login(client, accountA);
  client.activeDeviceId = "22222222-2222-4222-8222-222222222222";
  const scope = client.meteredSessionScope.bind(client);
  client.meteredSessionScope = async (device) => {
    const value = await scope(device);
    started.resolve();
    await resume.promise;
    return value;
  };
  const rejected = assert.rejects(client.quoteModel({
    modelCode: "cloud-test", path: "/v1/chat/completions", clientVersion: "1.1.84",
    prepared: { contentType: "application/json", body: '{"model":"cloud-test","messages":[]}' },
    devicePublicKeyHash: "test-device", signal: new AbortController().signal,
  }), sessionChanged);
  await started.promise;
  await client.logout();
  await login(client, accountB);
  resume.resolve();
  await rejected;
  assert.equal(quoteCalls, 0);
});
