// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { isProductionErrorResponse } from "@/modules/production/application/ports";

describe("Production response guards", () => {
  it("recognizes error responses without accepting success or invalid values", () => {
    expect(isProductionErrorResponse({ ok: false, error: "failed" })).toBe(true);
    expect(isProductionErrorResponse({ ok: true, data: {} })).toBe(false);
    expect(isProductionErrorResponse(null)).toBe(false);
  });
});
