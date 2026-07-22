// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { stylePreviewUrl } from "@/lib/style-preview-url";

describe("stylePreviewUrl", () => {
  it("encodes style ids and cache-busts preset preview images", () => {
    expect(stylePreviewUrl("spider verse/mixed media")).toBe(
      "/api/v1/styles/spider%20verse%2Fmixed%20media/preview?v=main-preset-png",
    );
  });
});
