import { describe, expect, it } from "vitest";

import {
  canCancelCommercialInvocation,
  canSaveCommercialInvocationResult,
  parseCommercialInvocationDetails,
  parseCommercialInvocationList,
  parseCommercialInvocationSaveResult,
} from "@/modules/model_usage/domain/commercial-invocation";

const invocation = {
  id: "11111111-1111-4111-8111-111111111111",
  modelCode: "image-v1",
  operation: "IMAGE",
  executionMode: "SYNC",
  status: "RUNNING",
  quotaStatus: "RESERVED",
  reservationId: "22222222-2222-4222-8222-222222222222",
  reservedUnits: 10,
  chargedUnits: 0,
  refundedUnits: 0,
  balanceBefore: 960,
  balanceAfter: 950,
  errorCode: "",
  errorMessage: "",
  createdAt: "2026-08-01T00:00:00Z",
  startedAt: "2026-08-01T00:00:01Z",
  completedAt: "",
  durationMs: 0,
};

describe("commercial invocations", () => {
  it("preserves UUID invocation identifiers and local pagination", () => {
    expect(
      parseCommercialInvocationList(
        { items: [invocation], total: 42 },
        { page: 2, pageSize: 20 },
      ),
    ).toEqual({
      items: [invocation],
      total: 42,
      page: 2,
      pageSize: 20,
    });
  });

  it("parses the documented invocation details envelope", () => {
    expect(
      parseCommercialInvocationDetails({
        invocation: {
          ...invocation,
          status: "FAILED",
          quotaStatus: "COMMITTED",
          chargedUnits: 8,
          refundedUnits: 2,
          balanceAfter: 952,
          errorCode: "UPSTREAM_UNAVAILABLE",
          errorMessage: "upstream unavailable",
          completedAt: "2026-08-01T00:00:10Z",
          durationMs: 9_000,
        },
      }),
    ).toEqual({
      ...invocation,
      status: "FAILED",
      quotaStatus: "COMMITTED",
      chargedUnits: 8,
      refundedUnits: 2,
      balanceAfter: 952,
      errorCode: "UPSTREAM_UNAVAILABLE",
      errorMessage: "upstream unavailable",
      completedAt: "2026-08-01T00:00:10Z",
      durationMs: 9_000,
    });
  });

  it("validates the discriminated save-result command response", () => {
    expect(parseCommercialInvocationSaveResult({ saved: false })).toEqual({
      saved: false,
    });
    expect(
      parseCommercialInvocationSaveResult({
        saved: true,
        fileName: "result.png",
      }),
    ).toEqual({ saved: true, fileName: "result.png" });
    expect(() =>
      parseCommercialInvocationSaveResult({
        saved: false,
        fileName: "unexpected.png",
      }),
    ).toThrow(/fields must be exactly/);
  });

  it("only offers cancellation for non-terminal states", () => {
    expect(canCancelCommercialInvocation("RUNNING")).toBe(true);
    expect(canCancelCommercialInvocation("PENDING")).toBe(true);
    expect(canCancelCommercialInvocation("SUCCEEDED")).toBe(false);
    expect(canCancelCommercialInvocation("FAILED")).toBe(false);
    expect(canCancelCommercialInvocation("CANCELLED")).toBe(false);
    expect(canCancelCommercialInvocation("REJECTED_NO_COST")).toBe(false);
  });

  it("only offers result saving for successful states", () => {
    expect(canSaveCommercialInvocationResult("SUCCEEDED")).toBe(true);
    expect(canSaveCommercialInvocationResult("COMPLETED")).toBe(true);
    expect(canSaveCommercialInvocationResult("RUNNING")).toBe(false);
    expect(canSaveCommercialInvocationResult("FAILED")).toBe(false);
  });
});
