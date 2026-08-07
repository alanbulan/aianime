// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VideoFrameStripCaptureOptions } from "../application/videoFrameStrip";

const captureVideoFrameStrip = vi.hoisted(() => vi.fn());

import { createGetFilmstrip, pickFrame } from "./filmstrip";

let getFilmstrip = createGetFilmstrip({ captureVideoFrameStrip });

beforeEach(() => {
  captureVideoFrameStrip.mockReset();
  getFilmstrip = createGetFilmstrip({ captureVideoFrameStrip });
});

describe("filmstrip", () => {
  it("uses the shared adapter with duration-based limits and caches by URL", async () => {
    const frames = [
      { timeMs: 500, url: "frame-1" },
      { timeMs: 1_500, url: "frame-2" },
    ];
    captureVideoFrameStrip.mockResolvedValue(frames);

    const resolveMediaUrl = (url: string) => `resolved:${url}`;
    const first = getFilmstrip(
      "https://cdn.example.test/unique-clip.mp4",
      resolveMediaUrl,
    );
    const second = getFilmstrip(
      "https://cdn.example.test/unique-clip.mp4",
      resolveMediaUrl,
    );

    await expect(first).resolves.toEqual(frames);
    await expect(second).resolves.toEqual(frames);
    expect(captureVideoFrameStrip).toHaveBeenCalledOnce();
    expect(captureVideoFrameStrip.mock.calls[0]?.[0]).toBe(
      "resolved:https://cdn.example.test/unique-clip.mp4",
    );
    const options = captureVideoFrameStrip.mock.calls[0]?.[1] as
      | VideoFrameStripCaptureOptions
      | undefined;
    expect(options?.targetWidth).toBe(120);
    expect(typeof options?.count).toBe("function");
    const resolveCount = options?.count as (durationSeconds: number) => number;
    expect(resolveCount(2)).toBe(6);
    expect(resolveCount(12)).toBe(12);
    expect(resolveCount(100)).toBe(40);
  });

  it("picks the captured frame closest to the source time", () => {
    const frames = [
      { timeMs: 500, url: "frame-1" },
      { timeMs: 1_500, url: "frame-2" },
      { timeMs: 2_500, url: "frame-3" },
    ];

    expect(pickFrame(frames, 1_900)).toEqual(frames[1]);
    expect(pickFrame([], 1_900)).toBeNull();
  });
});
