import { describe, expect, it } from "vitest";
import { formatBudgetMultiplier, formatBudgetPoints, parseBudgetConfirmation } from "./budget-confirmation";

const state = {
  revision: 1, pendingCount: 1,
  request: { requestId: "11111111-1111-4111-8111-111111111111", modelCode: "MINIMAX_H3", modelName: "MiniMax H3",
    estimatedMicroPoints: "2160000000", maximumMicroPoints: "2160000000", policyVersion: 2,
    tenantMultiplier: "1.000000000000000000", expiresAt: "2027-01-01T00:00:00Z", estimateOnly: true },
};

describe("bounded display-only billing prompt", () => {
  it("validates the exact main-process IPC shape and never calculates another budget", () => {
    expect(parseBudgetConfirmation(state)).toEqual(state);
    expect(parseBudgetConfirmation({ revision: 4, pendingCount: 0, request: null }).request).toBeNull();
    for (const invalid of [ { ...state, revision: -1 }, { ...state, pendingCount: 0 }, { ...state, token: "fixture" },
      { ...state, request: { ...state.request, maximumMicroPoints: "1" } },
      { ...state, request: { ...state.request, maximumMicroPoints: 2160000000 } },
      { ...state, request: { ...state.request, maximumMicroPoints: "9000000000000001" } },
      { ...state, request: { ...state.request, quoteId: "fixture" } },
      { ...state, request: { ...state.request, expiresAt: "invalid" } } ]) expect(() => parseBudgetConfirmation(invalid)).toThrow();
  });
  it("formats points and rates without floating point or long trailing zeros", () => {
    expect(formatBudgetPoints("2160000000", "en")).toBe("2,160");
    expect(formatBudgetPoints("1", "en")).toBe("0.000001");
    expect(formatBudgetPoints("9000000000000000", "en")).toBe("9,000,000,000");
    expect(formatBudgetMultiplier("1.000000000000000000")).toBe("1");
    expect(formatBudgetMultiplier("1.150000000000000000")).toBe("1.15");
    expect(formatBudgetMultiplier("0.00000100")).toBe("0.000001");
  });
});
