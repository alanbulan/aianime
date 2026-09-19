import { describe, expect, it } from "vitest";
import { formatCommercialUnits } from "@/modules/model_usage/domain/quota-units";
import { parseCommercialInvocationDetails } from "@/modules/model_usage/domain/commercial-invocation";
import { parseCommercialQuota } from "@/modules/model_usage/domain/commercial-model-access";

const id = "11111111-1111-4111-8111-111111111111";
const invocation = { id, modelCode: "cloud-test", operation: "TEXT", executionMode: "SYNC", status: "SUCCEEDED", quotaStatus: "COMMITTED",
  reservationId: id, reservedUnits: 1000000, chargedUnits: 1, refundedUnits: 999999, balanceBefore: 1000000, balanceAfter: 999999,
  errorCode: "", errorMessage: "", createdAt: "", startedAt: "", completedAt: "", durationMs: 1 };

describe("versioned quota unit projections", () => {
  it("keeps legacy records in their original units and formats micro points exactly", () => {
    expect(formatCommercialUnits(1000001)).toBe("1000001");
    expect(formatCommercialUnits(1000001, "METERED_V2")).toBe("0.01000001");
    expect(formatCommercialUnits(1, "METERED_V2")).toBe("0.00000001");
    expect(formatCommercialUnits(0, "METERED_V2")).toBe("0");
    expect(formatCommercialUnits(9000000000000000, "METERED_V2")).toBe("90000000");
    expect(() => formatCommercialUnits(Number.MAX_SAFE_INTEGER + 1, "METERED_V2")).toThrow();
  });
  it("accepts either the old exact contract or versioned quote and bill references", () => {
    expect(parseCommercialInvocationDetails({ invocation })).toEqual(invocation);
    const metered = { ...invocation, billingVersion: "METERED_V2", billingQuoteId: id, consumptionBillId: id };
    expect(parseCommercialInvocationDetails({ invocation: metered })).toEqual(metered);
    expect(() => parseCommercialInvocationDetails({ invocation: { ...metered, consumptionBillId: "not-a-uuid" } })).toThrow();
    expect(() => parseCommercialInvocationDetails({ invocation: { ...metered, billingVersion: "UNKNOWN" } })).toThrow();
    expect(() => parseCommercialInvocationDetails({ invocation: { ...invocation, consumptionBillId: id } })).toThrow();
  });
  it("preserves the balance asset marker without rewriting ledger amounts", () => {
    const quota = { assetVersion: "MICRO_POINT_V1", account: { id, subjectType: "USER", subjectId: 7, status: "ACTIVE", availableUnits: 1000001, reservedUnits: 1, refundFrozenUnits: 0, version: 1 }, buckets: [], spendableUnits: 1000000 };
    expect(parseCommercialQuota(quota)).toEqual({ spendableUnits: 1000000, availableUnits: 1000001, reservedUnits: 1, refundFrozenUnits: 0, assetVersion: "MICRO_POINT_V1" });
    expect(parseCommercialQuota({ ...quota, assetVersion: "MICRO_POINT_V1" }).assetVersion).toBe("MICRO_POINT_V1");
    expect(() => parseCommercialQuota({ ...quota, assetVersion: "MYSTERY" })).toThrow();
  });
});
