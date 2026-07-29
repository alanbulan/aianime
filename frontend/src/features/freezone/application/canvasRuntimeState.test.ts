// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyRemoteFreezoneCanvas,
  consumeQueuedLocalFreezoneProjections,
  flushFreezoneCanvasRuntime,
  type LocalProjectionPayload,
  queueLocalFreezoneProjection,
  registerFreezoneCanvasRuntime,
  removeLocalFreezoneProjection,
} from "./canvasRuntimeState";

const unregisterCallbacks: Array<() => void> = [];

function trackRuntime(unregister: () => void): () => void {
  unregisterCallbacks.push(unregister);
  return unregister;
}

describe("freezone canvas runtime state", () => {
  afterEach(() => {
    while (unregisterCallbacks.length > 0) {
      unregisterCallbacks.pop()?.();
    }
  });

  it("routes remote apply and flush commands only to the matching runtime", async () => {
    const apply = vi.fn();
    const flush = vi.fn().mockResolvedValue(true);
    const unregister = trackRuntime(
      registerFreezoneCanvasRuntime("project-a", "canvas-a", apply, flush),
    );
    const remote = { nodes: [], edges: [], revision: 3 };

    expect(
      applyRemoteFreezoneCanvas("project-a", "other-canvas", remote),
    ).toBe(false);
    expect(
      applyRemoteFreezoneCanvas("project-a", "canvas-a", remote),
    ).toBe(true);
    expect(apply).toHaveBeenCalledWith(remote, undefined);
    await expect(
      flushFreezoneCanvasRuntime("project-a", "canvas-a"),
    ).resolves.toBe(true);

    unregister();
    expect(
      applyRemoteFreezoneCanvas("project-a", "canvas-a", remote),
    ).toBe(false);
    await expect(
      flushFreezoneCanvasRuntime("project-a", "canvas-a"),
    ).resolves.toBeNull();
  });

  it("does not let an older unregister callback clear the active runtime", () => {
    const firstApply = vi.fn();
    const secondApply = vi.fn();
    const unregisterFirst = trackRuntime(
      registerFreezoneCanvasRuntime("project-a", "canvas-a", firstApply),
    );
    trackRuntime(
      registerFreezoneCanvasRuntime("project-a", "canvas-b", secondApply),
    );

    unregisterFirst();

    expect(
      applyRemoteFreezoneCanvas("project-a", "canvas-b", {
        nodes: [],
        edges: [],
      }),
    ).toBe(true);
    expect(firstApply).not.toHaveBeenCalled();
    expect(secondApply).toHaveBeenCalledTimes(1);
  });

  it("deduplicates queued projections and retains rejected entries for retry", () => {
    const applyLocalProjection = vi
      .fn((_projection: LocalProjectionPayload) => true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    trackRuntime(
      registerFreezoneCanvasRuntime(
        "project-a",
        "canvas-a",
        vi.fn(),
        undefined,
        applyLocalProjection,
      ),
    );
    queueLocalFreezoneProjection("project-a", "canvas-a", {
      projectionKey: "beat:1:1",
      nodes: [],
      edges: [],
      metadata: { version: 1 },
    });
    queueLocalFreezoneProjection("project-a", "canvas-a", {
      projectionKey: "beat:1:2",
      nodes: [],
      edges: [],
    });
    queueLocalFreezoneProjection("project-a", "canvas-a", {
      projectionKey: "beat:1:1",
      nodes: [],
      edges: [],
      metadata: { version: 2 },
    });

    expect(
      consumeQueuedLocalFreezoneProjections("project-a", "canvas-a"),
    ).toBe(true);
    expect(
      applyLocalProjection.mock.calls.map(([projection]) =>
        projection.projectionKey,
      ),
    ).toEqual(["beat:1:2", "beat:1:1"]);
    expect(applyLocalProjection.mock.calls[1][0].metadata).toEqual({
      version: 2,
    });

    expect(
      consumeQueuedLocalFreezoneProjections("project-a", "canvas-a"),
    ).toBe(true);
    expect(applyLocalProjection.mock.calls[2][0].projectionKey).toBe(
      "beat:1:2",
    );
    expect(
      consumeQueuedLocalFreezoneProjections("project-a", "canvas-a"),
    ).toBe(false);
  });

  it("routes projection removal only through the matching runtime", () => {
    const removeLocalProjection = vi.fn().mockReturnValue(true);
    trackRuntime(
      registerFreezoneCanvasRuntime(
        "project-a",
        "canvas-a",
        vi.fn(),
        undefined,
        undefined,
        removeLocalProjection,
      ),
    );

    expect(
      removeLocalFreezoneProjection("project-a", "other-canvas", "beat:1:1"),
    ).toBe(false);
    expect(
      removeLocalFreezoneProjection("project-a", "canvas-a", "beat:1:1"),
    ).toBe(true);
    expect(removeLocalProjection).toHaveBeenCalledWith("beat:1:1");
  });
});
