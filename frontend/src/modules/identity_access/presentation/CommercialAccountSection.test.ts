// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { distinctInfoDetail } from "@/modules/identity_access/presentation/CommercialAccountSection";

describe("Commercial account info details", () => {
  it("suppresses duplicated labels and formatted timestamps", () => {
    expect(distinctInfoDetail("专业版", "专业版")).toBeUndefined();
    expect(
      distinctInfoDetail("2026/8/9 23:42:50", "2026/8/9 23:42:50"),
    ).toBeUndefined();
  });

  it("keeps a distinct secondary status", () => {
    expect(distinctInfoDetail("LegionY9000P", "有效")).toBe("有效");
  });
});
