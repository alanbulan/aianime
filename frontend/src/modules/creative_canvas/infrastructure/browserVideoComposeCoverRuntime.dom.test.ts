// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureVideoComposeCoverFrame,
  waitForVideoComposeCoverFrameReady,
} from "./browserVideoComposeCoverRuntime";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("browserVideoComposeCoverRuntime", () => {
  it("waits for a pending seek and removes both listeners", async () => {
    const listeners = new Map<string, EventListener>();
    const removeEventListener = vi.fn();
    const video = {
      seeking: true,
      readyState: 1,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener);
      }),
      removeEventListener,
    } as unknown as HTMLVideoElement;

    const pending = waitForVideoComposeCoverFrameReady(video);
    Object.defineProperties(video, {
      seeking: { configurable: true, value: false },
      readyState: { configurable: true, value: 2 },
    });
    listeners.get("seeked")?.(new Event("seeked"));

    await expect(pending).resolves.toBeUndefined();
    expect(removeEventListener).toHaveBeenCalledTimes(2);
  });

  it("captures the current frame as a JPEG blob", async () => {
    const blob = new Blob(["cover"], { type: "image/jpeg" });
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((callback: BlobCallback) => callback(blob)),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, "createElement").mockReturnValue(canvas);
    const video = {
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement;

    await expect(captureVideoComposeCoverFrame(video, 0.8)).resolves.toBe(blob);
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1920, 1080);
    expect(canvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.8,
    );
  });

  it("returns null when the source has no drawable dimensions", async () => {
    await expect(captureVideoComposeCoverFrame({
      videoWidth: 0,
      videoHeight: 0,
    } as HTMLVideoElement)).resolves.toBeNull();
  });
});
