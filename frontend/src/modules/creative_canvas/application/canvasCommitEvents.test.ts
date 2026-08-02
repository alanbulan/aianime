// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  canvasCommitEvents,
  publishCanvasAssetsUpdated,
  publishCanvasCommitRequested,
} from "./canvasCommitEvents";

describe("Creative Canvas commit events", () => {
  it("publishes commit and asset refresh events and supports unsubscribe", () => {
    const onCommit = vi.fn();
    const onAssetsChanged = vi.fn();
    const unsubscribeCommit = canvasCommitEvents.subscribeCommit(onCommit);
    const unsubscribeAssets =
      canvasCommitEvents.subscribeAssetsChanged(onAssetsChanged);

    publishCanvasCommitRequested({ nodeId: "node-a", auto: true });
    publishCanvasAssetsUpdated();
    expect(onCommit).toHaveBeenCalledWith({ nodeId: "node-a", auto: true });
    expect(onAssetsChanged).toHaveBeenCalledTimes(1);

    unsubscribeCommit();
    unsubscribeAssets();
    publishCanvasCommitRequested({ nodeId: "node-b" });
    publishCanvasAssetsUpdated();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onAssetsChanged).toHaveBeenCalledTimes(1);
  });
});
