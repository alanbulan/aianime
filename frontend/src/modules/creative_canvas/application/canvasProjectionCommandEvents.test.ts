// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  canvasProjectionCommandEvents,
  publishCanvasProjectionRemovalRequested,
  publishCanvasProjectionSyncRequested,
} from "./canvasProjectionCommandEvents";

describe("Creative Canvas projection command events", () => {
  it("publishes typed sync and removal commands and supports unsubscribe", () => {
    const onSync = vi.fn();
    const onRemove = vi.fn();
    const unsubscribeSync = canvasProjectionCommandEvents.subscribe(
      "freezone/projection-sync",
      onSync,
    );
    const unsubscribeRemove = canvasProjectionCommandEvents.subscribe(
      "freezone/projection-remove",
      onRemove,
    );

    publishCanvasProjectionSyncRequested("beat:1:4");
    publishCanvasProjectionRemovalRequested("episode:1");
    expect(onSync).toHaveBeenCalledWith({ projectionKey: "beat:1:4" });
    expect(onRemove).toHaveBeenCalledWith({ projectionKey: "episode:1" });

    unsubscribeSync();
    unsubscribeRemove();
    publishCanvasProjectionSyncRequested("beat:1:5");
    publishCanvasProjectionRemovalRequested("episode:2");
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
