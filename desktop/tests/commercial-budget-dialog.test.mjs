import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MeteredBudgetDialog } from "../src/commercial-billing-dialog.ts";
import { MeteredBudgetAuthorizer } from "../src/commercial-metered-billing.ts";
import { CommercialIpcContext } from "../src/commercial-ipc-context.ts";
import { COMMERCIAL_CHANNELS, COMMERCIAL_IPC_ERROR_PREFIX } from "../src/commercial-ipc.ts";
import { registerCommercialModelHandlers } from "../src/commercial-ipc-model-handlers.ts";
import { parseBudgetConfirmation, formatBudgetPoints, formatBudgetMultiplier } from "../../frontend/src/modules/model_usage/domain/budget-confirmation.ts";

const quote = (extra = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", billingVersion: "METERED_V2",
  policyId: "22222222-2222-4222-8222-222222222222", policyVersion: 2,
  modelCode: "MINIMAX_H3", publicModelName: "MiniMax H3 (Self-hosted)",
  estimatedMicroPoints: "2160000000", maximumMicroPoints: "2160000000",
  tenantMultiplier: "1.000000000000000000", expiresAt: new Date(Date.now() + 60_000).toISOString(),
  requestHash: "a".repeat(64), status: "QUOTED", estimateOnly: true, ...extra,
});

function fixture(t, now) {
  const events = [];
  const queue = new MeteredBudgetDialog((state) => { events.push(structuredClone(state)); return true; }, now);
  t.after(() => queue.clear());
  return { queue, events };
}

test("main snapshots roundtrip through the real renderer parser without leaking quote credentials", async (t) => {
  const { queue, events } = fixture(t);
  const waiting = queue.confirm(quote(), new AbortController().signal);
  const state = parseBudgetConfirmation(events.at(-1));
  assert.equal(formatBudgetPoints(state.request.maximumMicroPoints, "en"), "2,160");
  assert.equal(formatBudgetMultiplier(state.request.tenantMultiplier), "1");
  assert(!JSON.stringify(state).includes("requestHash"));
  assert(!JSON.stringify(state).includes(quote().id));
  const copy = queue.snapshot();
  copy.request.maximumMicroPoints = "0";
  assert.equal(queue.snapshot().request.maximumMicroPoints, "2160000000");
  assert.deepEqual(queue.respond({ requestId: state.request.requestId, decision: "accept" }), { applied: true });
  assert.equal(await waiting, true);
  assert.deepEqual(queue.snapshot(), { revision: 2, pendingCount: 0, request: null });
  assert.deepEqual(queue.respond({ requestId: state.request.requestId, decision: "accept" }), { applied: false });
});

test("cancel, Escape-equivalent decisions, abort, expiry and disappearing window never authorize", async (t) => {
  let now = Date.now();
  const { queue } = fixture(t, () => now);
  const first = queue.confirm(quote(), new AbortController().signal);
  queue.respond({ requestId: queue.snapshot().request.requestId, decision: "cancel" });
  assert.equal(await first, false);
  const controller = new AbortController();
  const aborted = queue.confirm(quote(), controller.signal);
  controller.abort();
  assert.equal(await aborted, false);
  const expiresAt = new Date(now + 1000).toISOString();
  const expired = queue.confirm(quote({ expiresAt }), new AbortController().signal);
  now += 1001;
  assert.deepEqual(queue.respond({ requestId: queue.snapshot().request.requestId, decision: "accept" }), { applied: false });
  assert.equal(await expired, false);
  assert.equal(await new MeteredBudgetDialog(() => false).confirm(quote(), new AbortController().signal), false);
  assert.equal(await new MeteredBudgetDialog(() => { throw new Error("destroyed"); }).confirm(quote(), new AbortController().signal), false);
});

test("queued prompts are individually bound and cancelled queued work resolves immediately", async (t) => {
  const { queue } = fixture(t);
  const a = queue.confirm(quote(), new AbortController().signal);
  const firstId = queue.snapshot().request.requestId;
  const cancelled = new AbortController();
  const b = queue.confirm(quote({ modelCode: "seedance" }), cancelled.signal);
  const c = queue.confirm(quote({ modelCode: "other" }), new AbortController().signal);
  cancelled.abort();
  assert.equal(await b, false);
  assert.equal(queue.snapshot().pendingCount, 2);
  queue.respond({ requestId: firstId, decision: "accept" });
  assert.equal(await a, true);
  assert.equal(queue.snapshot().request.modelCode, "other");
  assert.deepEqual(queue.respond({ requestId: firstId, decision: "accept" }), { applied: false });
  queue.clear();
  assert.equal(await c, false);
});

test("expiry automatically releases an unattended prompt and queue has a finite bound", async (t) => {
  const { queue } = fixture(t);
  assert.equal(await queue.confirm(quote({ expiresAt: new Date(Date.now() + 20).toISOString() }), new AbortController().signal), false);
  const pending = Array.from({ length: 32 }, () => queue.confirm(quote(), new AbortController().signal));
  assert.equal(await queue.confirm(quote(), new AbortController().signal), false);
  queue.clear();
  assert.deepEqual(await Promise.all(pending), Array(32).fill(false));
});

test("unknown decision fields cannot change the frozen budget or authorize another prompt", async (t) => {
  const { queue } = fixture(t);
  const waiting = queue.confirm(quote(), new AbortController().signal);
  const requestId = queue.snapshot().request.requestId;
  for (const input of [null, [], true, { requestId, accepted: true }, { requestId, decision: "accept", maximumMicroPoints: "1" }, { requestId, decision: "yes" }]) {
    assert.throws(() => queue.respond(input));
  }
  assert.deepEqual(queue.respond({ requestId: "different", decision: "accept" }), { applied: false });
  queue.respond({ requestId, decision: "cancel" });
  assert.equal(await waiting, false);
});

test("budget IPC uses the same trusted main-frame boundary and does not accept foreign renderers", async (t) => {
  const { queue } = fixture(t);
  const handlers = new Map();
  const frame = {};
  const context = new CommercialIpcContext({
    client: {}, budgetDialog: queue,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    isAllowedSender: (id, source, main) => id === 7 && source === frame && main === frame,
  }, COMMERCIAL_CHANNELS, COMMERCIAL_IPC_ERROR_PREFIX);
  registerCommercialModelHandlers(context);
  const waiting = queue.confirm(quote(), new AbortController().signal);
  const requestId = queue.snapshot().request.requestId;
  for (const event of [{ sender: { id: 99, mainFrame: frame }, senderFrame: frame }, { sender: { id: 7, mainFrame: frame }, senderFrame: {} }]) {
    await assert.rejects(handlers.get(COMMERCIAL_CHANNELS.budgetDecision)(event, { requestId, decision: "accept" }), /IPC_SENDER_FORBIDDEN/);
    await assert.rejects(handlers.get(COMMERCIAL_CHANNELS.budgetSnapshot)(event), /IPC_SENDER_FORBIDDEN/);
  }
  const event = { sender: { id: 7, mainFrame: frame }, senderFrame: frame };
  assert.equal((await handlers.get(COMMERCIAL_CHANNELS.budgetSnapshot)(event)).request.requestId, requestId);
  await handlers.get(COMMERCIAL_CHANNELS.budgetDecision)(event, { requestId, decision: "cancel" });
  assert.equal(await waiting, false);
});

test("custom UI confirmation preserves one accepted quote through concurrent request replay", async (t) => {
  const { queue } = fixture(t);
  const authorizer = new MeteredBudgetAuthorizer((value, signal) => queue.confirm(value, signal));
  let requested = 0;
  const authorize = () => authorizer.authorize("one-intent", "MINIMAX_H3", "/v1/videos", { body: '{"model":"MINIMAX_H3","prompt":"fixture"}', contentType: "application/json" }, "1.1.76", async () => { requested++; return quote(); }, new AbortController().signal);
  const first = authorize();
  const second = authorize();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requested, 1);
  assert.equal(queue.snapshot().pendingCount, 1);
  queue.respond({ requestId: queue.snapshot().request.requestId, decision: "accept" });
  for (const result of await Promise.all([first, second])) {
    assert.equal(JSON.parse(result.body).max_cost_micro_points, "2160000000");
    assert.equal(JSON.parse(result.body).billing_quote_id, quote().id);
  }
});

test("renderer-only billing confirmation has no native fallback and preload exposes no raw IPC event", () => {
  const source = readFileSync(new URL("../src/commercial-billing-dialog.ts", import.meta.url), "utf8");
  assert(!source.includes("showMessageBox"));
  assert(!source.includes('from "electron"'));
  const preload = readFileSync(new URL("../src/preload.cts", import.meta.url), "utf8");
  for (const key of ["budgetSnapshot", "budgetDecision", "budgetChanged"]) assert(preload.includes(COMMERCIAL_CHANNELS[key]));
  assert(preload.includes("=> listener(state)"));
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert(main.includes('"render-process-gone"'));
  assert(main.includes('"did-start-navigation"'));
  const development = readFileSync(new URL("../scripts/dev.mjs", import.meta.url), "utf8");
  assert(development.includes("budgetDialog.confirm(quote, signal)"));
  assert(development.includes("budgetDialog,"));
});

test("logout while a quote is in flight cannot display or approve the old session's budget", async (t) => {
  const { queue } = fixture(t);
  const authorizer = new MeteredBudgetAuthorizer((value, signal) => queue.confirm(value, signal));
  let complete;
  const result = authorizer.authorize("old-session", "MINIMAX_H3", "/v1/videos", { body: '{"prompt":"fixture"}', contentType: "application/json" }, "1.1.76", () => new Promise((resolve) => { complete = resolve; }), new AbortController().signal);
  const rejected = assert.rejects(result, /abort/i);
  await new Promise((resolve) => setImmediate(resolve));
  authorizer.clear();
  complete(quote());
  await rejected;
  assert.equal(queue.snapshot().pendingCount, 0);
});
