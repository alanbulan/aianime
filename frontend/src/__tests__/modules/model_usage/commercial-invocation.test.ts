import { describe, expect, it } from "vitest";

import {
  canCancelCommercialInvocation,
  canSaveCommercialInvocationResult,
  parseCommercialInvocationDetails,
  parseCommercialInvocationList,
} from "@/modules/model_usage/domain/commercial-invocation";

describe("commercial invocations", () => {
  it("preserves string and safe integer identifiers in paged lists", () => {
    expect(
      parseCommercialInvocationList({
        items: [
          {
            id: "invocation-1",
            status: "RUNNING",
            operation: "IMAGE",
            modelSkuCode: "image-v1",
          },
          { id: 1201, status: "SUCCEEDED" },
        ],
        total: 42,
        page: 2,
        pageSize: 20,
      }),
    ).toEqual({
      items: [
        {
          id: "invocation-1",
          status: "RUNNING",
          operation: "IMAGE",
          modelSkuCode: "image-v1",
        },
        { id: 1201, status: "SUCCEEDED" },
      ],
      total: 42,
      page: 2,
      pageSize: 20,
    });
  });

  it("parses the documented invocation details envelope", () => {
    expect(
      parseCommercialInvocationDetails({
        invocation: {
          id: "invocation-2",
          status: "FAILED",
          errorMessage: "upstream unavailable",
          quotaStatus: "COMMITTED",
          reservationId: "reservation-2",
          reservedUnits: 10,
          chargedUnits: 8,
          refundedUnits: 2,
          balanceBefore: 960,
          balanceAfter: 952,
        },
      }),
    ).toEqual({
      id: "invocation-2",
      status: "FAILED",
      errorMessage: "upstream unavailable",
      quotaStatus: "COMMITTED",
      reservationId: "reservation-2",
      reservedUnits: 10,
      chargedUnits: 8,
      refundedUnits: 2,
      balanceBefore: 960,
      balanceAfter: 952,
    });
  });

  it("only offers cancellation for non-terminal states", () => {
    expect(canCancelCommercialInvocation("RUNNING")).toBe(true);
    expect(canCancelCommercialInvocation("PENDING")).toBe(true);
    expect(canCancelCommercialInvocation("SUCCEEDED")).toBe(false);
    expect(canCancelCommercialInvocation("FAILED")).toBe(false);
    expect(canCancelCommercialInvocation("CANCELLED")).toBe(false);
  });

  it("only offers result saving for successful states", () => {
    expect(canSaveCommercialInvocationResult("SUCCEEDED")).toBe(true);
    expect(canSaveCommercialInvocationResult("COMPLETED")).toBe(true);
    expect(canSaveCommercialInvocationResult("RUNNING")).toBe(false);
    expect(canSaveCommercialInvocationResult("FAILED")).toBe(false);
  });
});
