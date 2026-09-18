import test from "node:test";
import assert from "node:assert/strict";
import { ExecutionPolicySync, parseExecutionPolicy, desktopExecutionPolicy } from "../src/commercial-execution-policy.js";

const policy = (override = {}) => ({ apiMaxInflight: 32, desktopGeneralConcurrency: 4, desktopGeneralQueue: 32, desktopVideoConcurrency: 2, desktopVideoQueue: 16, version: 1, activeApiRequests: 0, updatedAt: "", ...override });

test("execution settings have a separate strict, bounded sidecar projection", () => {
  assert.equal(parseExecutionPolicy(policy({ desktopVideoQueue: 0 })).desktopVideoQueue, 0);
  for (const value of [0, 9, -1, 1.5, "2", true, null]) assert.throws(() => parseExecutionPolicy(policy({ desktopVideoConcurrency: value })));
  const missing = policy(); delete missing.desktopVideoQueue;
  assert.throws(() => parseExecutionPolicy(missing));
  assert.throws(() => parseExecutionPolicy(policy({ unknown: true })));
  const wire = desktopExecutionPolicy(parseExecutionPolicy(policy()));
  assert.deepEqual(Object.keys(wire).sort(), ["desktopGeneralConcurrency", "desktopGeneralQueue", "desktopVideoConcurrency", "desktopVideoQueue", "version"].sort());
  assert.equal(wire.apiMaxInflight, undefined);
  assert.equal(wire.modelCapabilities, undefined);
});

test("policy sync coalesces, applies real changes and rejects stale revisions", async () => {
  let value = policy(), reads = 0;
  const applied = [];
  const sync = new ExecutionPolicySync(async () => { reads++; return value; }, async () => "tenant:user", async (p) => { applied.push(p); });
  await Promise.all([sync.refresh(), sync.refresh()]);
  assert.equal(reads, 1); assert.equal(applied.length, 1);
  await sync.refresh(); assert.equal(applied.length, 1);
  value = policy({ version: 2, desktopVideoConcurrency: 4 });
  await sync.refresh(); assert.equal(applied.at(-1).desktopVideoConcurrency, 4);
  value = policy(); await assert.rejects(sync.refresh()); assert.equal(applied.length, 2);
  await sync.reset(); assert.equal(applied.at(-1), null);
});

test("logout and tenant changes discard pending policy responses", async () => {
  let complete;
  const waiting = new Promise((resolve) => { complete = resolve; });
  const applied = [];
  const sync = new ExecutionPolicySync(() => waiting, async () => "old:tenant", async (p) => { applied.push(p); });
  const request = sync.start();
  await Promise.resolve();
  await sync.reset();
  complete(policy()); await request;
  assert.deepEqual(applied, [null]);
});

test("a failed sidecar application is retried rather than cached as successful", async () => {
  let calls = 0;
  const sync = new ExecutionPolicySync(async () => policy(), async () => "tenant", async () => { if (++calls === 1) throw new Error("sidecar unavailable"); });
  await assert.rejects(sync.refresh());
  await sync.refresh(); assert.equal(calls, 2);
  await sync.reset();
});
