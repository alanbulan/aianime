// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  resolveCanvasUpscaleImageSize,
  resolveCanvasUpscaleScaleFactor,
} from "./upscale";

describe("upscale domain", () => {
  it("normalizes persisted image sizes", () => {
    expect(resolveCanvasUpscaleImageSize("1K")).toBe("1K");
    expect(resolveCanvasUpscaleImageSize("4K")).toBe("4K");
    expect(resolveCanvasUpscaleImageSize("8K")).toBe("2K");
    expect(resolveCanvasUpscaleImageSize(null)).toBe("2K");
  });

  it("normalizes persisted scale factors", () => {
    expect(resolveCanvasUpscaleScaleFactor(2)).toBe(2);
    expect(resolveCanvasUpscaleScaleFactor(6)).toBe(6);
    expect(resolveCanvasUpscaleScaleFactor(8)).toBe(2);
    expect(resolveCanvasUpscaleScaleFactor("4")).toBe(2);
  });
});
