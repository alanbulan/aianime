import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { projectCommercialQuota } from "../src/commercial-contracts.ts";

// Current Gateway ClientQuotaBalanceResp. Zero holds are explicit, not absent.
const fixture = {
  assetVersion: "MICRO_POINT_V1",
  account: {
    id: "11111111-1111-4111-8111-111111111111", subjectType: "USER", subjectId: 42,
    status: "ACTIVE", availableUnits: 10000000, reservedUnits: 2000000,
    refundFrozenUnits: 3000000, version: 7,
  },
  buckets: [{
    id: "22222222-2222-4222-8222-222222222222", sourceType: "TENANT_ALLOCATION",
    initialUnits: 10000000, remainingUnits: 10000000, reservedUnits: 2000000,
    refundFrozenUnits: 3000000, expiresAt: "", status: "ACTIVE", bucketType: "USER_ALLOCATION",
  }],
  spendableUnits: 5000000,
};

test("current Gateway quota fields survive desktop projection without overriding spendable balance", () => {
  const result = projectCommercialQuota(fixture);
  assert.equal(result.assetVersion, "MICRO_POINT_V1");
  assert.equal(result.account.refundFrozenUnits, 3000000);
  assert.equal(result.buckets[0].refundFrozenUnits, 3000000);
  assert.equal(result.spendableUnits, 5000000);
});

test("missing current fields and undeclared fields both fail closed", () => {
  const value = structuredClone(fixture);
  delete value.account.refundFrozenUnits;
  delete value.buckets[0].refundFrozenUnits;
  assert.throws(() => projectCommercialQuota(value), /fields must be exactly/);
  const unversioned = structuredClone(fixture);
  delete unversioned.assetVersion;
  assert.throws(() => projectCommercialQuota(unversioned), /fields must be exactly/);
  assert.throws(() => projectCommercialQuota({ ...fixture, internalTenantSecret: "forbidden" }), /fields must be exactly/);
  assert.throws(() => projectCommercialQuota({ ...fixture, account: { ...fixture.account, tenantId: 14 } }), /fields must be exactly/);
  assert.throws(() => projectCommercialQuota({ ...fixture, assetVersion: "LEGACY_UNIT" }), /Unsupported quota asset version/);
});

test("quota amounts remain safe nonnegative integers and never round an unsafe balance", () => {
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "3000000"]) {
    assert.throws(() => projectCommercialQuota({ ...fixture, account: { ...fixture.account, refundFrozenUnits: value } }), /non-negative integer/);
    assert.throws(() => projectCommercialQuota({ ...fixture, spendableUnits: value }), /non-negative integer/);
  }
});

test("renderer quota wire type includes the same refund freeze fields", () => {
  const types = readFileSync(new URL("../../frontend/src/types/desktop.d.ts", import.meta.url), "utf8");
  const quota = types.split("interface AIAnimeCommercialQuota {")[1].split("interface AIAnimeCommercialModel")[0];
  assert.equal((quota.match(/refundFrozenUnits: number/g) ?? []).length, 2);
});
