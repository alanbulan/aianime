// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  resolveCanvasVideoUpscaleDenoise,
  resolveCanvasVideoUpscaleResolution,
} from "./videoUpscale";

describe("video-upscale domain", () => {
  it("normalizes persisted resolutions", () => {
    expect(resolveCanvasVideoUpscaleResolution("1080p")).toBe("1080p");
    expect(resolveCanvasVideoUpscaleResolution("4k")).toBe("4k");
    expect(resolveCanvasVideoUpscaleResolution("8k")).toBe("1080p");
    expect(resolveCanvasVideoUpscaleResolution(null)).toBe("1080p");
  });

  it("normalizes persisted denoise strengths", () => {
    expect(resolveCanvasVideoUpscaleDenoise("none")).toBe("none");
    expect(resolveCanvasVideoUpscaleDenoise("2x")).toBe("2x");
    expect(resolveCanvasVideoUpscaleDenoise("3x")).toBe("1x");
    expect(resolveCanvasVideoUpscaleDenoise(null)).toBe("1x");
  });
});
