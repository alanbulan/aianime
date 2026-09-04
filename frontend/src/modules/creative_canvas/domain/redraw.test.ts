// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  resolveCanvasRedrawAspectRatio,
  resolveCanvasRedrawImageSize,
  resolveCanvasRedrawOutputAspectRatio,
} from "./redraw";

describe("redraw domain", () => {
  it("normalizes stored aspect ratios", () => {
    expect(resolveCanvasRedrawAspectRatio("16:9")).toBe("16:9");
    expect(resolveCanvasRedrawAspectRatio("2:1")).toBe("original");
    expect(resolveCanvasRedrawAspectRatio(null)).toBe("original");
  });

  it("normalizes stored image sizes", () => {
    expect(resolveCanvasRedrawImageSize("4K")).toBe("4K");
    expect(resolveCanvasRedrawImageSize("original")).toBe("original");
    expect(resolveCanvasRedrawImageSize("8K")).toBe("original");
    expect(resolveCanvasRedrawImageSize(null)).toBe("original");
  });

  it("uses the source ratio only for the original request", () => {
    expect(resolveCanvasRedrawOutputAspectRatio("original", "9:16")).toBe(
      "9:16",
    );
    expect(resolveCanvasRedrawOutputAspectRatio("16:9", "9:16")).toBe(
      "16:9",
    );
  });
});
