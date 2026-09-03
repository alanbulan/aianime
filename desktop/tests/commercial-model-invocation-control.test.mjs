import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EncryptedFileModelInvocationStore,
  InMemoryModelInvocationStore,
} from "../src/commercial-model-invocation-store.ts";
import { CommercialModelProxy } from "../src/commercial-model-proxy.ts";

const SUBJECT = "https://gateway.example.test|11|22";
const DEVICE = {
  async summary() {
    return { publicKeyHash: "device-public-key-hash" };
  },
};
const SECURE_STORAGE = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value, "utf8"),
  decryptString: (value) => value.toString("utf8"),
};

function configureCloudImage(proxy) {
  proxy.configureRouting({
    allowsCustomModels: false,
    cloudModelAssignments: [
      {
        modelId: "QWEN_IMAGE_2512",
        role: "IMAGE_GENERATION",
        priority: 100,
        enabled: true,
      },
    ],
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [],
    },
  });
}

function configureByokImage(proxy, baseUrl) {
  proxy.configureRouting({
    allowsCustomModels: true,
    cloudModelAssignments: [],
    access: {
      schemaVersion: 5,
      cloudModelAssignments: [],
      byokProviders: [
        {
          id: "local-image",
          name: "Local Image",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl,
          apiKey: "local-secret",
          enabled: true,
          priority: 10,
          modelAssignments: [
            {
              modelId: "local-image-v1",
              role: "IMAGE_GENERATION",
              priority: 10,
              enabled: true,
            },
          ],
        },
      ],
    },
  });
}

function imageRequest(proxy, idempotencyKey, prompt, taskId = "") {
  return fetch(`${proxy.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      ...(taskId ? { "X-AI-Anime-Task-ID": taskId } : {}),
    },
    body: JSON.stringify({
      model: "QWEN_IMAGE_2512",
      prompt,
      size: "1140x1472",
    }),
  });
}

test("concurrent cloud image retries single-flight one exact invocation", { timeout: 10_000 }, async (t) => {
  const { promise: responseReady, resolve: complete } = Promise.withResolvers();
  const invocationStore = new InMemoryModelInvocationStore();
  const claim = t.mock.method(invocationStore, "claim");
  const calls = [];
  const client = {
    async modelInvocationSubject() {
      return SUBJECT;
    },
    async modelRequest(input) {
      calls.push(input);
      await responseReady;
      return Response.json(
        { data: [{ b64_json: "image-result" }], id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        {
          headers: {
            "X-AI-Invocation-Id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "X-AI-Idempotency-Key": "image-single-flight",
          },
        },
      );
    },
  };
  const proxy = new CommercialModelProxy(client, DEVICE, undefined, { invocationStore });
  configureCloudImage(proxy);
  await proxy.start();
  t.after(async () => {
    complete();
    await proxy.stop();
  });

  const first = imageRequest(proxy, "image-single-flight", "same portrait");
  const second = imageRequest(proxy, "image-single-flight", "same portrait");
  const responses = Promise.allSettled([first, second]);
  // Both HTTP requests must reach the store while the upstream is still pending.
  // Releasing after only the first call races a later socket/request on macOS.
  await t.waitFor(() => {
    assert.equal(claim.mock.callCount(), 2);
    assert.ok(calls.length > 0);
  }, { interval: 1, timeout: 5_000 });
  assert.equal(calls.length, 1);
  complete();

  const [firstResponse, secondResponse] = (await responses).map((response) => {
    if (response.status === "rejected") throw response.reason;
    return response.value;
  });
  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  const result = await firstResponse.json();
  assert.deepEqual(result, await secondResponse.json());
  assert.equal(
    firstResponse.headers.get("x-ai-invocation-id"),
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
  assert.equal(
    secondResponse.headers.get("x-ai-idempotency-key"),
    "image-single-flight",
  );

  const conflict = await imageRequest(
    proxy,
    "image-single-flight",
    "different portrait",
  );
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(calls.length, 1);

  // A retry after completion asks the cloud gateway to replay the same key;
  // it is no longer part of the active local single-flight.
  const retry = await imageRequest(proxy, "image-single-flight", "same portrait");
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), result);
  assert.equal(
    retry.headers.get("x-ai-invocation-id"),
    firstResponse.headers.get("x-ai-invocation-id"),
  );
  assert.equal(calls.length, 2);
  assert.equal(new Headers(calls[0].headers).get("Idempotency-Key"), "image-single-flight");
  assert.equal(new Headers(calls[1].headers).get("Idempotency-Key"), "image-single-flight");
});

test("task cancellation persists before the cloud invocation is registered", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-task-cancellation-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const cancellationCalls = [];
  let modelCalls = 0;
  const client = {
    async modelInvocationSubject() {
      return SUBJECT;
    },
    async modelRequest() {
      modelCalls += 1;
      return Response.json({ data: [{ b64_json: "must-not-run" }] });
    },
    async cancelInvocationByIdempotencyKey(operation, idempotencyKey, reason) {
      cancellationCalls.push({ operation, idempotencyKey, reason });
      return {
        operation,
        idempotencyKey,
        cancellationRequested: true,
        cancellationReason: reason,
        cancellationRequestedAt: "2026-09-02T00:00:00Z",
        invocation: null,
      };
    },
  };
  const storePath = join(directory, "invocations");
  const firstProxy = new CommercialModelProxy(client, DEVICE, undefined, {
    invocationStore: new EncryptedFileModelInvocationStore(
      storePath,
      SECURE_STORAGE,
    ),
  });
  configureCloudImage(firstProxy);
  await firstProxy.start();

  const cancelResponse = await fetch(
    `${firstProxy.baseUrl}/_aigo/model-invocations/tasks/${taskId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firstProxy.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "user cancelled image task" }),
    },
  );
  assert.equal(cancelResponse.status, 200);
  await firstProxy.stop();

  const secondProxy = new CommercialModelProxy(client, DEVICE, undefined, {
    invocationStore: new EncryptedFileModelInvocationStore(
      storePath,
      SECURE_STORAGE,
    ),
  });
  configureCloudImage(secondProxy);
  await secondProxy.start();
  t.after(() => secondProxy.stop());
  const imageResponse = await imageRequest(
    secondProxy,
    "cancel-before-create",
    "cancelled portrait",
    taskId,
  );
  assert.equal(imageResponse.status, 409);
  const payload = await imageResponse.json();
  assert.equal(payload.error.code, "INVOCATION_CANCEL_REQUESTED");
  assert.equal(payload.invocation.executionStatus, "PENDING_CREATION");
  assert.equal(modelCalls, 0);
  assert.deepEqual(cancellationCalls, [
    {
      operation: "IMAGE",
      idempotencyKey: "cancel-before-create",
      reason: "user cancelled image task",
    },
  ]);
});

test("BYOK cancellation before dispatch preserves pending execution truth", async (t) => {
  const taskId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const client = {
    async modelInvocationSubject() {
      return SUBJECT;
    },
    async modelRequest() {
      throw new Error("cloud must not be called");
    },
  };
  const proxy = new CommercialModelProxy(client, DEVICE);
  configureByokImage(proxy, "http://127.0.0.1:9/v1");
  await proxy.start();
  t.after(() => proxy.stop());

  const cancelResponse = await fetch(
    `${proxy.baseUrl}/_aigo/model-invocations/tasks/${taskId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${proxy.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "user cancelled BYOK image task" }),
    },
  );
  assert.equal(cancelResponse.status, 200);

  const imageResponse = await imageRequest(
    proxy,
    "byok-cancel-before-dispatch",
    "cancelled BYOK portrait",
    taskId,
  );
  assert.equal(imageResponse.status, 409);
  const payload = await imageResponse.json();
  assert.equal(payload.error.code, "BYOK_REMOTE_CANCEL_UNSUPPORTED");
  assert.equal(payload.invocation.executionStatus, "PENDING");
  assert.equal(payload.invocation.quotaStatus, "PROVIDER_MANAGED");
});

test("internal cancellation control rejects malformed task paths and query parameters", async (t) => {
  let modelCalls = 0;
  const client = {
    async modelInvocationSubject() {
      return SUBJECT;
    },
    async modelRequest() {
      modelCalls += 1;
      return Response.json({ data: [] });
    },
  };
  const proxy = new CommercialModelProxy(client, DEVICE);
  configureCloudImage(proxy);
  await proxy.start();
  t.after(() => proxy.stop());

  const requestCancellation = (suffix) =>
    fetch(`${proxy.baseUrl}/_aigo/model-invocations/tasks/${suffix}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${proxy.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "user cancelled image task" }),
    });

  const malformed = await requestCancellation("not-a-uuid/cancel");
  const withQuery = await requestCancellation(
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cancel?unexpected=1",
  );

  assert.equal(malformed.status, 400);
  assert.equal(withQuery.status, 400);
  assert.equal(modelCalls, 0);
});

test("closing an image HTTP connection never requests explicit cloud cancellation", async (t) => {
  let resolveModel;
  let modelStarted;
  const started = new Promise((resolve) => {
    modelStarted = resolve;
  });
  let cancellationCalls = 0;
  const client = {
    async modelInvocationSubject() {
      return SUBJECT;
    },
    async modelRequest() {
      modelStarted();
      return new Promise((resolve) => {
        resolveModel = resolve;
      });
    },
    async cancelInvocationByIdempotencyKey() {
      cancellationCalls += 1;
      throw new Error("disconnect must not cancel");
    },
  };
  const proxy = new CommercialModelProxy(client, DEVICE);
  configureCloudImage(proxy);
  await proxy.start();
  t.after(() => proxy.stop());

  const url = new URL(`${proxy.baseUrl}/images/generations`);
  const request = httpRequest({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: "POST",
    headers: {
      Authorization: `Bearer ${proxy.token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "disconnect-is-not-cancel",
    },
  });
  request.on("error", () => {});
  request.end(JSON.stringify({ model: "QWEN_IMAGE_2512", prompt: "portrait" }));
  await started;
  request.destroy();
  resolveModel(Response.json({ data: [{ b64_json: "completed-remotely" }] }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(cancellationCalls, 0);
});

test("proxy shutdown closes local image waits without cancelling cloud execution", async () => {
  let resolveModel;
  let modelStarted;
  const started = new Promise((resolve) => {
    modelStarted = resolve;
  });
  let cancellationCalls = 0;
  const client = {
    async modelInvocationSubject() {
      return SUBJECT;
    },
    async modelRequest() {
      modelStarted();
      return new Promise((resolve) => {
        resolveModel = resolve;
      });
    },
    async cancelInvocationByIdempotencyKey() {
      cancellationCalls += 1;
      throw new Error("shutdown must not request explicit cancellation");
    },
  };
  const proxy = new CommercialModelProxy(client, DEVICE);
  configureCloudImage(proxy);
  await proxy.start();
  const pendingRequest = imageRequest(
    proxy,
    "shutdown-is-not-cancel",
    "portrait continues remotely",
  ).catch(() => null);
  await started;

  await Promise.race([
    proxy.stop(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("proxy shutdown timed out")), 500),
    ),
  ]);
  assert.equal(cancellationCalls, 0);
  resolveModel(Response.json({ data: [{ b64_json: "completed-remotely" }] }));
  await pendingRequest;
});

test("BYOK ambiguous writes never execute twice with the same key", async (t) => {
  let calls = 0;
  const provider = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Drain the body before returning the ambiguous upstream failure.
    }
    calls += 1;
    response.statusCode = 502;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: { message: "provider unavailable" } }));
  });
  await new Promise((resolve, reject) => {
    provider.once("error", reject);
    provider.listen(0, "127.0.0.1", () => {
      provider.off("error", reject);
      resolve();
    });
  });
  t.after(() => new Promise((resolve) => provider.close(resolve)));
  const address = provider.address();
  assert.ok(address && typeof address !== "string");

  const client = {
    async modelInvocationSubject() {
      return SUBJECT;
    },
    async modelRequest() {
      throw new Error("cloud must not be called");
    },
  };
  const proxy = new CommercialModelProxy(client, DEVICE);
  configureByokImage(proxy, `http://127.0.0.1:${address.port}/v1`);
  await proxy.start();
  t.after(() => proxy.stop());

  const first = await imageRequest(proxy, "byok-ambiguous", "same portrait");
  const firstPayload = await first.json();
  assert.equal(first.status, 502);
  assert.equal(firstPayload.error.code, "BYOK_EXECUTION_OUTCOME_UNKNOWN");

  const retry = await imageRequest(proxy, "byok-ambiguous", "same portrait");
  const retryPayload = await retry.json();
  assert.equal(retry.status, 502);
  assert.equal(retryPayload.error.code, "BYOK_EXECUTION_OUTCOME_UNKNOWN");
  assert.equal(calls, 1);
});

test("encrypted BYOK success replays after proxy restart without provider execution", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-image-invocations-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const provider = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Drain request body.
    }
    calls += 1;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data: [{ b64_json: "persisted-image" }] }));
  });
  await new Promise((resolve, reject) => {
    provider.once("error", reject);
    provider.listen(0, "127.0.0.1", () => {
      provider.off("error", reject);
      resolve();
    });
  });
  t.after(() => new Promise((resolve) => provider.close(resolve)));
  const address = provider.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const storePath = join(directory, "invocations");
  const client = {
    async modelInvocationSubject() {
      return SUBJECT;
    },
    async modelRequest() {
      throw new Error("cloud must not be called");
    },
  };

  const firstProxy = new CommercialModelProxy(client, DEVICE, undefined, {
    invocationStore: new EncryptedFileModelInvocationStore(
      storePath,
      SECURE_STORAGE,
    ),
  });
  configureByokImage(firstProxy, baseUrl);
  await firstProxy.start();
  const first = await imageRequest(firstProxy, "byok-persisted", "same portrait");
  assert.equal(first.status, 200);
  assert.equal((await first.json()).data[0].b64_json, "persisted-image");
  await firstProxy.stop();

  const secondProxy = new CommercialModelProxy(client, DEVICE, undefined, {
    invocationStore: new EncryptedFileModelInvocationStore(
      storePath,
      SECURE_STORAGE,
    ),
  });
  configureByokImage(secondProxy, baseUrl);
  await secondProxy.start();
  t.after(() => secondProxy.stop());
  const replay = await imageRequest(
    secondProxy,
    "byok-persisted",
    "same portrait",
  );
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).data[0].b64_json, "persisted-image");
  assert.equal(calls, 1);
});
