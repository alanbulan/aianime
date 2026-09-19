import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { MeteredBudgetAuthorizer, parseMeteredQuote, formatMicroPoints, attachBillingQuote,
  billingRequestFingerprint, modelQuoteKind } from "../src/commercial-metered-billing.ts";
import { projectCommercialModelCatalogItem, projectCommercialInvocation, projectCommercialQuota } from "../src/commercial-contracts.ts";
import { CommercialModelProxy } from "../src/commercial-model-proxy.ts";

const now = Date.parse("2026-09-17T04:00:00Z");
const quote = (extra = {}) => ({ id: "11111111-1111-4111-8111-111111111111", billingVersion: "METERED_V2",
  policyId: "22222222-2222-4222-8222-222222222222", policyVersion: 3,
  modelCode: "cloud-test", publicModelName: "测试模型", estimatedMicroPoints: "1000001", maximumMicroPoints: "2000000",
  tenantMultiplier: "1.25", expiresAt: new Date(now + 300000).toISOString(), requestHash: "a".repeat(64),
  status: "QUOTED", estimateOnly: true, ...extra });
const prepared = { contentType: "application/json", body: JSON.stringify({ model: "cloud-test", prompt: "a frame" }) };

test("micro point display never passes through float and permits explicit zero", () => {
  assert.equal(formatMicroPoints("1"), "0.00000001");
  assert.equal(formatMicroPoints("9000000000000000"), "90000000");
  assert.equal(formatMicroPoints("1000100"), "0.010001");
  assert.equal(formatMicroPoints("0"), "0");
  for (const amount of [1, "-1", "1.1", "01", "1e6", "9000000000000001"]) assert.throws(() => formatMicroPoints(amount));
});

test("quote parser rejects mismatches, expiry, unsafe numbers and unbounded proposals", () => {
  assert.equal(parseMeteredQuote(quote(), "cloud-test", now).maximumMicroPoints, "2000000");
  for (const invalid of [{ modelCode: "other" }, { billingVersion: "LEGACY" }, { expiresAt: "invalid" },
    { expiresAt: new Date(now).toISOString() }, { maximumMicroPoints: 2 }, { maximumMicroPoints: "0" },
    { estimateOnly: undefined }, { status: "BOUND" }, { requestHash: "" }, { policyId: "" }, { policyVersion: 0 }]) {
    assert.throws(() => parseMeteredQuote(quote(invalid), "cloud-test", now));
  }
  assert.equal(parseMeteredQuote(quote({ estimatedMicroPoints: "0", maximumMicroPoints: "0" }), "cloud-test", now).maximumMicroPoints, "0");
});

test("creation-point display preserves the reported image quote's exact authorized amount", () => {
  const parsed = parseMeteredQuote(quote({ estimatedMicroPoints: "217500000", maximumMicroPoints: "217500000" }), "cloud-test", now);
  assert.equal(formatMicroPoints(parsed.estimatedMicroPoints), "2.175");
  assert.equal(parsed.maximumMicroPoints, "217500000");
});

test("one intent has one quote and one confirmation across concurrent retries", async () => {
  let quotes = 0; let confirmations = 0;
  const authorizer = new MeteredBudgetAuthorizer(async () => { confirmations++; return true; }, () => now);
  const request = async () => { quotes++; return quote(); };
  const signal = new AbortController().signal;
  const results = await Promise.all(Array.from({ length: 12 }, () => authorizer.authorize("tenant:user:intent", "cloud-test", "/v1/images/generations", prepared, "1.1.73", request, signal)));
  assert.equal(quotes, 1); assert.equal(confirmations, 1);
  for (const result of results) {
    const body = JSON.parse(result.body);
    assert.equal(body.billing_quote_id, quote().id);
    assert.equal(body.max_cost_micro_points, "2000000");
    assert.equal(body.client_version, "1.1.73");
  }
  await assert.rejects(authorizer.authorize("tenant:user:intent", "cloud-test", "/v1/images/generations", { ...prepared, body: '{"prompt":"changed"}' }, "1.1.73", request, signal), /参数已改变/u);
  assert.equal(quotes, 1);
});

test("cancelled or expired confirmation never silently obtains another quote", async () => {
  let clock = now; let called = 0;
  const request = async () => { called++; return quote(); };
  const cancelled = new MeteredBudgetAuthorizer(async () => false, () => clock);
  const signal = new AbortController().signal;
  for (let i = 0; i < 2; i++) await assert.rejects(cancelled.authorize("cancel", "cloud-test", "/v1/images/generations", prepared, "1.1.73", request, signal), /取消/u);
  assert.equal(called, 1);
  const expired = new MeteredBudgetAuthorizer(async () => { clock += 300001; return true; }, () => clock);
  await assert.rejects(expired.authorize("expire", "cloud-test", "/v1/images/generations", prepared, "1.1.73", request, signal), /过期/u);
  assert.equal(called, 2);
});

test("multipart fingerprints bind actual bytes and attach a separate immutable envelope", async () => {
  const original = new FormData(); original.append("model", "cloud-test"); original.append("prompt", "frame");
  original.append("image", new Blob(["actual-image"], { type: "image/png" }), "before.png");
  const same = new FormData(); same.append("model", "cloud-test"); same.append("prompt", "frame");
  same.append("image", new Blob(["actual-image"], { type: "image/png" }), "after.png");
  assert.equal(await billingRequestFingerprint("cloud-test", "/v1/images/edits", { body: original }), await billingRequestFingerprint("cloud-test", "/v1/images/edits", { body: same }));
  same.set("image", new Blob(["changed"], { type: "image/png" }), "after.png");
  assert.notEqual(await billingRequestFingerprint("cloud-test", "/v1/images/edits", { body: original }), await billingRequestFingerprint("cloud-test", "/v1/images/edits", { body: same }));
  const attached = attachBillingQuote({ body: original }, quote(), "1.1.73");
  assert.equal(original.has("billing_quote_id"), false);
  assert.equal(attached.body.get("billing_quote_id"), quote().id);
  assert.equal(await attached.body.get("image").text(), "actual-image");
  assert.throws(() => attachBillingQuote({ body: '{"billing_quote_id":"spoof"}' }, quote(), "1.1.73"));
});

test("metered catalogs never present a fake fixed price and unknown versions fail closed", () => {
  const base = { id: quote().id, code: "cloud-test", displayName: "Test", operation: "TEXT", capabilityJson: "{}", parameterSchemaJson: "{}",
    clientVisible: true, status: "ACTIVE", createdAt: "", updatedAt: "", isDefault: true };
  const metered = { ...base, billingVersion: "METERED_V2", pricingMode: "CUSTOM", quoteRequired: true, pricingAvailable: true };
  assert.equal(projectCommercialModelCatalogItem(metered).unitsPerCall, undefined);
  assert.equal(projectCommercialModelCatalogItem({ ...base, unitsPerCall: 1 }).unitsPerCall, 1);
  assert.throws(() => projectCommercialModelCatalogItem({ ...metered, unitsPerCall: 0 }));
  assert.throws(() => projectCommercialModelCatalogItem({ ...metered, billingVersion: "FUTURE" }));
  assert.equal(modelQuoteKind("/v1/images/edits"), "image-edit");
  assert.equal(modelQuoteKind("/v1/videos/task/remix"), null);
});

test("versioned balances and invocation history keep exact source units", () => {
  const id = quote().id;
  const quota = { assetVersion: "MICRO_POINT_V1", account: { id, subjectType: "USER", subjectId: 7, status: "ACTIVE", availableUnits: 1000001, reservedUnits: 1, refundFrozenUnits: 0, version: 1 }, buckets: [], spendableUnits: 1000000 };
  assert.equal(projectCommercialQuota(quota).assetVersion, "MICRO_POINT_V1");
  assert.equal(projectCommercialQuota({ ...quota, assetVersion: "MICRO_POINT_V1" }).spendableUnits, 1000000);
  assert.throws(() => projectCommercialQuota({ ...quota, assetVersion: "UNKNOWN" }));
  const invocation = { id, modelCode: "cloud-test", operation: "TEXT", executionMode: "SYNC", status: "SUCCEEDED", quotaStatus: "COMMITTED", reservationId: id,
    reservedUnits: 1000000, chargedUnits: 1, refundedUnits: 999999, balanceBefore: 1000000, balanceAfter: 999999,
    errorCode: "", errorMessage: "", createdAt: "", startedAt: "", completedAt: "", durationMs: 1 };
  assert.deepEqual(projectCommercialInvocation(invocation), invocation);
  const metered = { ...invocation, billingVersion: "METERED_V2", billingQuoteId: id, consumptionBillId: id };
  assert.deepEqual(projectCommercialInvocation(metered), metered);
  assert.throws(() => projectCommercialInvocation({ ...metered, billingVersion: "UNKNOWN" }));
  assert.throws(() => projectCommercialInvocation({ ...invocation, consumptionBillId: id }));
});

test("budget cancellation never falls back to another paid model", { timeout: 10000 }, async (t) => {
  let cloudCalls = 0; let fallbackCalls = 0; let confirmations = 0;
  const fallback = createServer((_req, res) => { fallbackCalls++; res.end("unexpected"); });
  await new Promise((resolve) => fallback.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => fallback.close(resolve)));
  const client = { async meteredSessionScope() { return "tenant:user:device"; },
    async quoteModel() { return quote({ expiresAt: new Date(Date.now() + 300000).toISOString() }); },
    async modelRequest() { cloudCalls++; return Response.json({ choices: [] }); } };
  const proxy = new CommercialModelProxy(client, { async summary() { return { publicKeyHash: "hash" }; } }, undefined,
    { clientVersion: "1.1.73", confirmMeteredBudget: async () => { confirmations++; return false; } });
  proxy.configureRouting({ allowsCustomModels: true, cloudModelAssignments: [{ modelId: "cloud-test", role: "TEXT", priority: 1, enabled: true }],
    modelCapabilities: [{ modelId: "cloud-test", billingVersion: "METERED_V2", quoteRequired: true, pricingAvailable: true }],
    access: { schemaVersion: 5, cloudModelAssignments: [], byokProviders: [{ id: "fallback", name: "Fallback", protocol: "OPENAI_COMPATIBLE",
      baseUrl: `http://127.0.0.1:${fallback.address().port}/v1`, apiKey: "test-only", enabled: true, priority: 100,
      modelAssignments: [{ modelId: "fallback-test", role: "TEXT", priority: 100, enabled: true }] }] } });
  await proxy.start(); t.after(() => proxy.stop());
  const response = await fetch(`${proxy.baseUrl}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${proxy.token}`, "Content-Type": "application/json", "Idempotency-Key": "budget-intent" },
    body: JSON.stringify({ model: "cloud-test", messages: [{ role: "user", content: "hello" }] }) });
  assert.equal(response.ok, false); assert.equal(confirmations, 1); assert.equal(cloudCalls, 0); assert.equal(fallbackCalls, 0);
});
