import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { projectCommercialQuota } from "../src/commercial-contracts.ts";
import {
  parseCommercialQuota,
  parseCommercialModelUsageBootstrap,
} from "../../frontend/src/modules/model_usage/domain/commercial-model-access.ts";

const wire = JSON.parse(readFileSync(new URL("../../tests/fixtures/commercial-quota-current.json", import.meta.url), "utf8"));

test("current cloud balance survives main-process projection, IPC and renderer bootstrap", () => {
  const projected = projectCommercialQuota(wire);
  const ipc = structuredClone(projected);
  const direct = parseCommercialQuota(ipc);
  const startup = parseCommercialModelUsageBootstrap({
    personalQuota: ipc, models: null, softwareAuthorization: null, release: null, warnings: [],
  });
  assert.deepEqual(startup.quota, direct);
  assert.equal(direct.assetVersion, "MICRO_POINT_V1");
  assert.equal(direct.refundFrozenUnits, 3000000);
  // Spendable balance may be further bounded by eligible/expired buckets.
  // The renderer must preserve the server decision rather than recompute it.
  assert.equal(direct.spendableUnits, 4750000);
  assert.equal(ipc.buckets[0].refundFrozenUnits, 3000000);
});

test("zero balances and empty allocations still allow a valid bootstrap", () => {
  const empty = structuredClone(wire);
  empty.buckets = [];
  empty.spendableUnits = 0;
  Object.assign(empty.account, { availableUnits: 0, reservedUnits: 0, refundFrozenUnits: 0 });
  assert.equal(parseCommercialQuota(projectCommercialQuota(empty)).spendableUnits, 0);
});

test("renderer validates declared refund holds without accepting unrelated fields", () => {
  const projected = projectCommercialQuota(wire);
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "3000000", null, NaN, Infinity]) {
    for (const nested of ["account", "bucket"]) {
      const input = structuredClone(projected);
      (nested === "account" ? input.account : input.buckets[0]).refundFrozenUnits = value;
      assert.throws(() => parseCommercialQuota(input), /refundFrozenUnits/);
    }
  }
  assert.throws(() => parseCommercialQuota({ ...projected, internalTenantSecret: "fixture" }), /fields must be exactly/);
  assert.throws(() => parseCommercialQuota({ ...projected, account: { ...projected.account, tenantId: 14 } }), /fields must be exactly/);
  for (const field of ["assetVersion", "account.refundFrozenUnits", "buckets.refundFrozenUnits"]) {
    const input = structuredClone(projected);
    if (field === "assetVersion") delete input.assetVersion;
    else if (field.startsWith("account")) delete input.account.refundFrozenUnits;
    else delete input.buckets[0].refundFrozenUnits;
    assert.throws(() => parseCommercialQuota(input), /fields must be exactly/);
  }
});
