import { describe, expect, it } from "vitest";
import { formatBillPoints, hasFinalBillAmount } from "./commercial-bill";

describe("confirmed consumption bill amounts", () => {
  it("distinguishes a confirmed no-charge result from unknown usage", () => {
    for (const status of ["SETTLED", "FAILED_NO_CHARGE", "RELEASED", "ADJUSTED"]) expect(hasFinalBillAmount(status)).toBe(true);
    for (const status of ["ESTIMATED", "PROVISIONAL", "REVIEW_REQUIRED", "PENDING", "UNKNOWN", ""]) expect(hasFinalBillAmount(status)).toBe(false);
  });
  it("keeps micro-point display exact at both numerical extremes", () => {
    expect(formatBillPoints("1")).toBe("0.000001");
    expect(formatBillPoints("9000000000000000")).toBe("9000000000");
    expect(formatBillPoints("0")).toBe("0");
    expect(() => formatBillPoints("9000000000000001")).toThrow();
  });
});
