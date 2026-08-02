// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VideoFrameStripCaptureOptions } from "../application/videoFrameStrip";

const captureBrowserVideoFrameStrip = vi.hoisted(() => vi.fn());

vi.mock("../infrastructure/browserVideoFrameStrip", () => ({
  captureBrowserVideoFrameStrip,
}));

import { getFilmstrip, pickFrame } from "./filmstrip";

beforeEach(() => {
  captureBrowserVideoFrameStrip.mockReset();
});

describe("filmstrip", () => {
  it("uses the shared adapter with duration-based limits and caches by URL", async () => {
    const frames = [
      { timeMs: 500, url: "frame-1" },
      { timeMs: 1_500, url: "frame-2" },
    ];
    captureBrowserVideoFrameStrip.mockResolvedValue(frames);

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
    expect(captureBrowserVideoFrameStrip).toHaveBeenCalledOnce();
    expect(captureBrowserVideoFrameStrip.mock.calls[0]?.[0]).toBe(
      "resolved:https://cdn.example.test/unique-clip.mp4",
    );
    const options = captureBrowserVideoFrameStrip.mock.calls[0]?.[1] as
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
