// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  resolveCanvasRedrawAspectRatio,
  resolveCanvasRedrawImageSize,
} from "./redraw";

describe("redraw domain", () => {
  it("normalizes stored aspect ratios", () => {
    expect(resolveCanvasRedrawAspectRatio("16:9")).toBe("16:9");
    expect(resolveCanvasRedrawAspectRatio("2:1")).toBe("original");
    expect(resolveCanvasRedrawAspectRatio(null)).toBe("original");
  });

  it("normalizes stored image sizes", () => {
    expect(resolveCanvasRedrawImageSize("4K")).toBe("4K");
    expect(resolveCanvasRedrawImageSize("8K")).toBe("2K");
    expect(resolveCanvasRedrawImageSize(null)).toBe("2K");
  });
});
