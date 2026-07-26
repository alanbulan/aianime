// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  VIDEO_CLIP_MIN_DURATION_MS,
  constrainVideoClipEndMs,
  constrainVideoClipStartMs,
  resolveVideoClipRange,
} from "./videoClipRange";

describe("videoClipRange", () => {
  it("resolves an explicit range within the source duration", () => {
    expect(
      resolveVideoClipRange({
        durationMs: 2_000,
        startMs: 250,
        endMs: 1_750,
      }),
    ).toEqual({
      totalMs: 2_000,
      startMs: 250,
      endMs: 1_750,
      selectionMs: 1_500,
    });
  });

  it("uses the complete source when no explicit range exists", () => {
    expect(
      resolveVideoClipRange({
        durationMs: 2_000,
        startMs: null,
        endMs: undefined,
      }),
    ).toEqual({
      totalMs: 2_000,
      startMs: 0,
      endMs: 2_000,
      selectionMs: 2_000,
    });
    expect(
      resolveVideoClipRange({
        durationMs: null,
        startMs: null,
        endMs: null,
      }),
    ).toEqual({ totalMs: null, startMs: 0, endMs: 0, selectionMs: 0 });
  });

  it("clamps stored endpoints to the source duration", () => {
    expect(
      resolveVideoClipRange({
        durationMs: 2_000,
        startMs: 2_500,
        endMs: 3_000,
      }),
    ).toEqual({
      totalMs: 2_000,
      startMs: 2_000,
      endMs: 2_000,
      selectionMs: 0,
    });
  });

  it("enforces the shared minimum duration while dragging endpoints", () => {
    expect(VIDEO_CLIP_MIN_DURATION_MS).toBe(200);
    expect(constrainVideoClipStartMs(-50, 2_000)).toBe(0);
    expect(constrainVideoClipStartMs(1_900, 2_000)).toBe(1_800);
    expect(constrainVideoClipEndMs(100, 0, 2_000)).toBe(200);
    expect(constrainVideoClipEndMs(2_500, 0, 2_000)).toBe(2_000);
  });
});
