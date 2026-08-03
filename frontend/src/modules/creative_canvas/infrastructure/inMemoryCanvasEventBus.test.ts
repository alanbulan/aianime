// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import { InMemoryCanvasEventBus } from "./inMemoryCanvasEventBus";

describe("InMemoryCanvasEventBus", () => {
  it("publishes a typed payload to every subscriber in registration order", () => {
    const bus = new InMemoryCanvasEventBus();
    const calls: string[] = [];
    bus.subscribe("video-viewer/open", ({ videoUrl }) => {
      calls.push(`first:${videoUrl}`);
    });
    bus.subscribe("video-viewer/open", ({ videoUrl }) => {
      calls.push(`second:${videoUrl}`);
    });

    bus.publish("video-viewer/open", { videoUrl: "/preview.mp4" });

    expect(calls).toEqual([
      "first:/preview.mp4",
      "second:/preview.mp4",
    ]);
  });

  it("stops notifying an unsubscribed handler without affecting others", () => {
    const bus = new InMemoryCanvasEventBus();
    const removed = vi.fn();
    const retained = vi.fn();
    const unsubscribe = bus.subscribe("tool-dialog/close", removed);
    bus.subscribe("tool-dialog/close", retained);

    unsubscribe();
    unsubscribe();
    bus.publish("tool-dialog/close", undefined);

    expect(removed).not.toHaveBeenCalled();
    expect(retained).toHaveBeenCalledOnce();
  });

  it("keeps subscribers isolated by event type", () => {
    const bus = new InMemoryCanvasEventBus();
    const upload = vi.fn();
    const reupload = vi.fn();
    bus.subscribe("upload-node/external-file", upload);
    bus.subscribe("upload-node/reupload", reupload);
    const file = new File(["image"], "image.png", { type: "image/png" });

    bus.publish("upload-node/external-file", { nodeId: "upload-1", file });

    expect(upload).toHaveBeenCalledWith({ nodeId: "upload-1", file });
    expect(reupload).not.toHaveBeenCalled();
  });
});
