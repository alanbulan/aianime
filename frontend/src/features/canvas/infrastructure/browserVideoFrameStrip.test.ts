// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from "vitest";

import { captureBrowserVideoFrameStrip } from "./browserVideoFrameStrip";

interface FrameStripHarness {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  emitVideoEvent(type: string): void;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  seekTargets: number[];
  video: HTMLVideoElement;
}

function installFrameStripElements(options?: {
  contextAvailable?: boolean;
  duration?: number;
}): FrameStripHarness {
  const listeners = new Map<string, EventListenerOrEventListenerObject[]>();
  const load = vi.fn();
  const removeAttribute = vi.fn();
  const seekTargets: number[] = [];
  const drawImage = vi.fn();
  const context = { drawImage } as unknown as CanvasRenderingContext2D;
  let encodedFrame = 0;
  const canvas = {
    getContext: vi.fn(() =>
      options?.contextAvailable === false ? null : context,
    ),
    height: 0,
    toDataURL: vi.fn(() => `frame-${++encodedFrame}`),
    width: 0,
  } as unknown as HTMLCanvasElement;
  const video = {
    addEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
    ),
    crossOrigin: "",
    duration: options?.duration ?? 4,
    load,
    muted: false,
    playsInline: false,
    preload: "",
    removeAttribute,
    src: "",
    videoHeight: 720,
    videoWidth: 1280,
  } as unknown as HTMLVideoElement;
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => seekTargets[seekTargets.length - 1] ?? 0,
    set: (value: number) => seekTargets.push(value),
  });

  vi.spyOn(document, "createElement").mockImplementation(
    ((tagName: string) => {
      if (tagName === "video") return video;
      if (tagName === "canvas") return canvas;
      throw new Error(`unexpected element: ${tagName}`);
    }) as typeof document.createElement,
  );

  return {
    canvas,
    context,
    emitVideoEvent: (type) => {
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === "function") {
          listener.call(video, new Event(type));
        } else {
          listener.handleEvent(new Event(type));
        }
      }
    },
    load,
    removeAttribute,
    seekTargets,
    video,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("captureBrowserVideoFrameStrip", () => {
  it("captures evenly spaced JPEG frames with a duration-based count", async () => {
    const harness = installFrameStripElements({ duration: 4 });

    const result = captureBrowserVideoFrameStrip(
      "https://cdn.example.test/clip.mp4",
      {
        count: (duration) => duration / 2,
        targetWidth: 160,
      },
    );
    expect(harness.video.crossOrigin).toBe("anonymous");
    expect(harness.video.preload).toBe("auto");
    expect(harness.video.src).toBe("https://cdn.example.test/clip.mp4");

    harness.emitVideoEvent("loadeddata");
    expect(harness.seekTargets).toEqual([1]);
    harness.emitVideoEvent("seeked");
    expect(harness.seekTargets).toEqual([1, 3]);
    harness.emitVideoEvent("seeked");

    await expect(result).resolves.toEqual([
      { timeMs: 1_000, url: "frame-1" },
      { timeMs: 3_000, url: "frame-2" },
    ]);
    expect(harness.canvas.width).toBe(160);
    expect(harness.canvas.height).toBe(90);
    expect(harness.context.drawImage).toHaveBeenCalledTimes(2);
    expect(harness.removeAttribute).toHaveBeenCalledWith("src");
    expect(harness.load).toHaveBeenCalledTimes(2);
  });

  it("uses a fixed frame count for blob media", async () => {
    const harness = installFrameStripElements({ duration: 2 });

    const result = captureBrowserVideoFrameStrip("blob:clip", {
      count: 1,
      targetWidth: 120,
    });
    harness.emitVideoEvent("loadeddata");
    harness.emitVideoEvent("seeked");

    await expect(result).resolves.toEqual([
      { timeMs: 1_000, url: "frame-1" },
    ]);
    expect(harness.video.crossOrigin).toBe("");
  });

  it("rejects and releases media with an invalid duration", async () => {
    const harness = installFrameStripElements({ duration: Number.NaN });

    const result = captureBrowserVideoFrameStrip("blob:invalid-video", {
      count: 8,
      targetWidth: 160,
    });
    harness.emitVideoEvent("loadeddata");

    await expect(result).rejects.toThrow("invalid video duration");
    expect(harness.removeAttribute).toHaveBeenCalledWith("src");
  });

  it("rejects when a canvas context is unavailable", async () => {
    installFrameStripElements({ contextAvailable: false });

    const result = captureBrowserVideoFrameStrip("/static/clip.mp4", {
      count: 8,
      targetWidth: 160,
    });

    await expect(result).rejects.toThrow("canvas context unavailable");
  });
});
