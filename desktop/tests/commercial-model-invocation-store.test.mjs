import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EncryptedFileModelInvocationStore,
  InMemoryModelInvocationStore,
} from "../src/commercial-model-invocation-store.ts";

const RETENTION = 24 * 60 * 60_000;
const CLAIM = {
  subject: "tenant-a:user-a",
  operation: "IMAGE_GENERATION",
  idempotencyKey: "image-1",
  requestHash: "request-1",
  taskId: "task-1",
  routeKey: "route-1",
  routeSource: "byok",
};
const RESPONSE = {
  status: 200,
  statusText: "OK",
  headers: { "content-type": "application/json" },
  bodyBase64: Buffer.from(JSON.stringify({ image: "large-image-data" })).toString("base64"),
};
const STORAGE = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value),
  decryptString: (value) => value.toString(),
};

async function fixture(t, storage = STORAGE) {
  const directory = await mkdtemp(join(tmpdir(), "ai-anime-invocation-cache-"));
  let now = Date.parse("2026-09-24T00:00:00Z");
  const stores = [];
  const open = () => {
    const store = new EncryptedFileModelInvocationStore(directory, storage, () => now);
    stores.push(store);
    return store;
  };
  t.after(async () => {
    for (const store of stores) await store.stopMaintenance();
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, open, advance: (ms) => { now += ms; }, now: () => now };
}

async function files(directory, folder) {
  try { return await readdir(join(directory, folder)); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

test("cached bodies are separate from durable identity and replay after restart", async (t) => {
  const f = await fixture(t);
  const store = f.open();
  await store.claim(CLAIM);
  await store.complete(CLAIM, "SUCCEEDED", RESPONSE);
  const [name] = await files(f.directory, "invocations");
  const metadata = JSON.parse(await readFile(join(f.directory, "invocations", name), "utf8"));
  assert.equal(metadata.response, null);
  assert.equal(metadata.state, "SUCCEEDED");
  assert.deepEqual(await files(f.directory, "responses"), [name]);
  const replay = await f.open().claim(CLAIM);
  assert.equal(replay.kind, "existing");
  assert.deepEqual(replay.record.response, RESPONSE);
});

for (const restart of [false, true]) {
  test(`expiry removes the body but retains idempotency ${restart ? "after restart" : "during maintenance"}`, async (t) => {
    const f = await fixture(t);
    const first = f.open();
    await first.claim(CLAIM);
    await first.complete(CLAIM, "SUCCEEDED", RESPONSE);
    f.advance(RETENTION);
    const store = restart ? f.open() : first;
    await store.pruneExpiredResponses();
    assert.deepEqual(await files(f.directory, "responses"), []);
    assert.equal((await files(f.directory, "invocations")).length, 1);
    const replay = await store.claim(CLAIM);
    assert.equal(replay.kind, "existing");
    assert.equal(replay.record.state, "SUCCEEDED");
    assert.equal(replay.record.response, null);
    assert.equal(replay.record.responseExpiresAt, "");
    assert.equal((await store.claim({ ...CLAIM, requestHash: "changed" })).kind, "conflict");
  });
}

for (const expired of [false, true]) {
  test(`legacy embedded response migration preserves identity (${expired ? "expired" : "valid"})`, async (t) => {
    const f = await fixture(t);
    const legacyStore = new InMemoryModelInvocationStore(f.now);
    await legacyStore.claim(CLAIM);
    const legacy = await legacyStore.complete(CLAIM, "SUCCEEDED", RESPONSE);
    const name = createHash("sha256")
      .update(CLAIM.subject).update("\0").update(CLAIM.operation).update("\0")
      .update(CLAIM.idempotencyKey).digest("hex") + ".bin";
    await mkdir(join(f.directory, "invocations"), { recursive: true });
    await writeFile(join(f.directory, "invocations", name), STORAGE.encryptString(JSON.stringify(legacy)));
    if (expired) f.advance(RETENTION);
    const migrated = await f.open().claim(CLAIM);
    assert.equal(migrated.kind, "existing");
    assert.equal(migrated.record.state, "SUCCEEDED");
    assert.deepEqual(migrated.record.response, expired ? null : RESPONSE);
    const metadata = JSON.parse(await readFile(join(f.directory, "invocations", name), "utf8"));
    assert.equal(metadata.response, null);
    assert.equal((await files(f.directory, "responses")).length, expired ? 0 : 1);
  });
}

test("task lookup and cancellation only decrypt matching metadata, preserving cached bodies", async (t) => {
  const decrypted = [];
  const f = await fixture(t, {
    ...STORAGE,
    decryptString(value) {
      const text = value.toString();
      decrypted.push(JSON.parse(text));
      return text;
    },
  });
  const store = f.open();
  for (const claim of [CLAIM, { ...CLAIM, subject: "tenant-b:user-b" },
    { ...CLAIM, idempotencyKey: "image-2", taskId: "task-2" }]) {
    await store.claim(claim);
    await store.complete(claim, "SUCCEEDED", RESPONSE);
  }
  const restarted = f.open();
  await restarted.initialize();
  decrypted.length = 0;
  const records = await restarted.recordsForTask(CLAIM.subject, CLAIM.taskId);
  assert.equal(records.length, 1);
  assert.equal(records[0].subject, CLAIM.subject);
  assert.equal(decrypted.length, 1);
  assert.equal(decrypted[0].schemaVersion, 1);
  await restarted.requestCancellation(CLAIM, "cancelled by user");
  assert.equal(decrypted.length, 2);
  assert.ok(decrypted.every((record) => record.schemaVersion === 1));
  assert.equal((await files(f.directory, "responses")).length, 3);
  assert.deepEqual((await restarted.claim(CLAIM)).record.response, RESPONSE);
});

test("maintenance periodically deletes expired bodies and stops without another timer", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = await fixture(t);
  const store = f.open();
  await store.claim(CLAIM);
  await store.complete(CLAIM, "SUCCEEDED", RESPONSE);
  const errors = [];
  await store.startMaintenance((error) => errors.push(error));
  const prune = t.mock.method(store, "pruneExpiredResponses");
  f.advance(RETENTION);
  t.mock.timers.tick(60_000);
  await store.stopMaintenance();
  assert.deepEqual(errors, []);
  assert.deepEqual(await files(f.directory, "responses"), []);
  assert.equal(prune.mock.callCount(), 1);
  t.mock.timers.tick(60_000);
  assert.equal(prune.mock.callCount(), 1);
});

test("stopping during initialization waits for cleanup and prevents late timer registration", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = await fixture(t);
  const store = f.open();
  const gate = Promise.withResolvers();
  const initialize = store.initialize.bind(store);
  t.mock.method(store, "initialize", async () => { await gate.promise; await initialize(); });
  const prune = t.mock.method(store, "pruneExpiredResponses");
  const starting = store.startMaintenance(() => assert.fail("unexpected maintenance error"));
  let stopped = false;
  const stopping = store.stopMaintenance().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  gate.resolve();
  await Promise.all([starting, stopping]);
  t.mock.timers.tick(60_000);
  assert.equal(prune.mock.callCount(), 1);
});

test("failed metadata commit leaves durable state and orphan cleanup is recoverable", async (t) => {
  let rejectCommit = false;
  const f = await fixture(t, {
    ...STORAGE,
    encryptString(value) {
      const record = JSON.parse(value);
      if (rejectCommit && record.schemaVersion === 1 && record.state === "SUCCEEDED") {
        throw new Error("metadata write failed");
      }
      return Buffer.from(value);
    },
  });
  const store = f.open();
  await store.claim(CLAIM);
  await store.markStarted(CLAIM, { key: CLAIM.routeKey, source: "byok" });
  rejectCommit = true;
  await assert.rejects(store.complete(CLAIM, "SUCCEEDED", RESPONSE), /metadata write failed/);
  assert.equal((await files(f.directory, "responses")).length, 1);
  rejectCommit = false;
  const replay = await f.open().claim(CLAIM);
  assert.equal(replay.kind, "existing");
  assert.equal(replay.record.state, "IN_FLIGHT");
  assert.deepEqual(await files(f.directory, "responses"), []);
});

test("expiry metadata failure can be retried without recreating an expired body", async (t) => {
  let rejectCommit = false;
  const f = await fixture(t, {
    ...STORAGE,
    encryptString(value) {
      const record = JSON.parse(value);
      if (rejectCommit && record.schemaVersion === 1 && record.state === "SUCCEEDED" && !record.responseExpiresAt) {
        throw new Error("expiry write failed");
      }
      return Buffer.from(value);
    },
  });
  const store = f.open();
  await store.claim(CLAIM);
  await store.complete(CLAIM, "SUCCEEDED", RESPONSE);
  f.advance(RETENTION);
  rejectCommit = true;
  await assert.rejects(store.pruneExpiredResponses(), /expiry write failed/);
  assert.deepEqual(await files(f.directory, "responses"), []);
  rejectCommit = false;
  await store.pruneExpiredResponses();
  const replay = await store.claim(CLAIM);
  assert.equal(replay.record.state, "SUCCEEDED");
  assert.equal(replay.record.responseExpiresAt, "");
});
