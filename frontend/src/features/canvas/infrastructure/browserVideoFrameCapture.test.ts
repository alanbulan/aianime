// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from "vitest";

import { captureVideoFrameBlob } from "./browserVideoFrameCapture";

interface FrameCaptureHarness {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  emitVideoEvent(type: string): void;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  video: HTMLVideoElement;
}

function installFrameCaptureElements(options?: {
  blob?: Blob | null;
  contextAvailable?: boolean;
  duration?: number;
}): FrameCaptureHarness {
  const listeners = new Map<string, EventListenerOrEventListenerObject[]>();
  const load = vi.fn();
  const removeAttribute = vi.fn();
  const drawImage = vi.fn();
  const context = { drawImage } as unknown as CanvasRenderingContext2D;
  const blob = options?.blob === undefined
    ? new Blob(["frame"], { type: "image/png" })
    : options.blob;
  const canvas = {
    getContext: vi.fn(() =>
      options?.contextAvailable === false ? null : context,
    ),
    height: 0,
    toBlob: vi.fn((callback: BlobCallback) => callback(blob)),
    width: 0,
  } as unknown as HTMLCanvasElement;
  const video = {
    addEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
    ),
    crossOrigin: "",
    currentTime: 0,
    duration: options?.duration ?? 3,
    load,
    muted: false,
    playsInline: false,
    preload: "",
    removeAttribute,
    src: "",
    videoHeight: 720,
    videoWidth: 1280,
  } as unknown as HTMLVideoElement;

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
    video,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("captureVideoFrameBlob", () => {
  it("loads, clamps and captures an external video frame as PNG", async () => {
    const harness = installFrameCaptureElements({ duration: 3 });

    const result = captureVideoFrameBlob(
      "https://cdn.example.test/clip.mp4",
      10,
    );
    expect(harness.video.crossOrigin).toBe("anonymous");
    expect(harness.video.preload).toBe("auto");
    expect(harness.video.src).toBe("https://cdn.example.test/clip.mp4");

    harness.emitVideoEvent("loadeddata");
    expect(harness.video.currentTime).toBeCloseTo(2.95);
    harness.emitVideoEvent("seeked");

    await expect(result).resolves.toEqual(
      expect.objectContaining({ type: "image/png" }),
    );
    expect(harness.canvas.width).toBe(1280);
    expect(harness.canvas.height).toBe(720);
    expect(harness.context.drawImage).toHaveBeenCalledWith(
      harness.video,
      0,
      0,
    );
    expect(harness.removeAttribute).toHaveBeenCalledWith("src");
    expect(harness.load).toHaveBeenCalledTimes(2);
  });

  it("rejects and releases the video when its duration is invalid", async () => {
    const harness = installFrameCaptureElements({ duration: Number.NaN });

    const result = captureVideoFrameBlob("blob:invalid-video", 0);
    harness.emitVideoEvent("loadeddata");

    await expect(result).rejects.toThrow("invalid video duration");
    expect(harness.video.crossOrigin).toBe("");
    expect(harness.removeAttribute).toHaveBeenCalledWith("src");
  });

  it("rejects when a canvas context is unavailable", async () => {
    const harness = installFrameCaptureElements({ contextAvailable: false });

    const result = captureVideoFrameBlob("/static/clip.mp4", 1);
    harness.emitVideoEvent("loadeddata");
    harness.emitVideoEvent("seeked");

    await expect(result).rejects.toThrow("canvas context unavailable");
    expect(harness.removeAttribute).toHaveBeenCalledWith("src");
  });

  it("rejects a null PNG encoding result after releasing the video", async () => {
    const harness = installFrameCaptureElements({ blob: null });

    const result = captureVideoFrameBlob("/static/clip.mp4", 1);
    harness.emitVideoEvent("loadeddata");
    harness.emitVideoEvent("seeked");

    await expect(result).rejects.toThrow("canvas.toBlob returned null");
    expect(harness.removeAttribute).toHaveBeenCalledWith("src");
  });
});
