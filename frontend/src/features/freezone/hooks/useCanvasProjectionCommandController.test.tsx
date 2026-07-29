// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { canvasEventBus } from "@/features/canvas/application/canvasServices";

import {
  useCanvasProjectionCommandController,
  type CanvasProjectionCommandControllerOptions,
} from "./useCanvasProjectionCommandController";

const mocks = vi.hoisted(() => ({
  buildProjectionFromPreset: vi.fn(),
  consumeQueuedLocalFreezoneProjections: vi.fn(),
  queueLocalFreezoneProjection: vi.fn(),
  removeLocalFreezoneProjection: vi.fn(),
  markCanvasProjectionFresh: vi.fn(),
}));

vi.mock("../composition", () => ({
  buildProjectionFromPreset: mocks.buildProjectionFromPreset,
}));

vi.mock("../application/canvasRuntimeState", () => ({
  consumeQueuedLocalFreezoneProjections: mocks.consumeQueuedLocalFreezoneProjections,
  queueLocalFreezoneProjection: mocks.queueLocalFreezoneProjection,
  removeLocalFreezoneProjection: mocks.removeLocalFreezoneProjection,
}));

vi.mock("../application/canvasProjectionStatusState", () => ({
  markCanvasProjectionFresh: mocks.markCanvasProjectionFresh,
}));

function createOptions(
  overrides: Partial<CanvasProjectionCommandControllerOptions> = {},
): CanvasProjectionCommandControllerOptions {
  return {
    projectId: "project-a",
    canvasId: "user_eric",
    metadata: {
      projections: {
        "beat:1:4": {
          projection_key: "beat:1:4",
          request: {
            scope: "beat",
            episode: 1,
            beat: 4,
            primary_slot: "sketch",
          },
        },
      },
    },
    messages: {
      syncMissingRequest: "missing request",
      syncSuccess: "synced",
      removeBlocked: "remove blocked",
      removeSuccess: "removed",
    },
    onMessage: vi.fn(),
    ...overrides,
  };
}

describe("canvas projection command controller", () => {
  beforeEach(() => {
    mocks.buildProjectionFromPreset.mockReset().mockResolvedValue({
      projection_key: "beat:1:4",
      facts_signature: "facts-v2",
      nodes: [{ id: "projection-node" }],
      edges: [{ id: "projection-edge" }],
      metadata: { source: "server" },
    });
    mocks.consumeQueuedLocalFreezoneProjections.mockReset();
    mocks.queueLocalFreezoneProjection.mockReset();
    mocks.removeLocalFreezoneProjection.mockReset().mockReturnValue(true);
    mocks.markCanvasProjectionFresh.mockReset();
  });

  it("builds, queues and marks one projection from the canvas event", async () => {
    let resolveBuild!: (value: {
      projection_key: string;
      facts_signature: string;
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
      metadata: Record<string, unknown>;
    }) => void;
    mocks.buildProjectionFromPreset.mockImplementationOnce(() => new Promise((resolve) => {
      resolveBuild = resolve;
    }));
    const options = createOptions();
    const hook = renderHook(() => useCanvasProjectionCommandController(options));

    act(() => {
      canvasEventBus.publish("freezone/projection-sync", { projectionKey: "beat:1:4" });
      canvasEventBus.publish("freezone/projection-sync", { projectionKey: "beat:1:4" });
    });

    expect(mocks.buildProjectionFromPreset).toHaveBeenCalledTimes(1);
    expect(mocks.buildProjectionFromPreset).toHaveBeenCalledWith("project-a", {
      scope: "beat",
      episode: 1,
      beat: 4,
      primary_slot: "render",
      asset_kind: undefined,
      character: undefined,
      identity_id: undefined,
      asset_id: undefined,
      projection_key: "beat:1:4",
      base_revision: 0,
      force_refresh: true,
    });

    await act(async () => {
      resolveBuild({
        projection_key: "beat:1:4",
        facts_signature: "facts-v2",
        nodes: [{ id: "projection-node" }],
        edges: [{ id: "projection-edge" }],
        metadata: { source: "server" },
      });
      await Promise.resolve();
    });

    expect(mocks.queueLocalFreezoneProjection).toHaveBeenCalledWith(
      "project-a",
      "user_eric",
      expect.objectContaining({
        projectionKey: "beat:1:4",
        nodes: [{ id: "projection-node" }],
        edges: [{ id: "projection-edge" }],
      }),
    );
    expect(mocks.consumeQueuedLocalFreezoneProjections).toHaveBeenCalledWith(
      "project-a",
      "user_eric",
    );
    expect(mocks.markCanvasProjectionFresh).toHaveBeenCalledWith("beat:1:4");
    expect(options.onMessage).toHaveBeenCalledWith("synced");

    hook.unmount();
    canvasEventBus.publish("freezone/projection-sync", { projectionKey: "beat:1:4" });
    expect(mocks.buildProjectionFromPreset).toHaveBeenCalledTimes(1);
  });

  it("reports projection metadata that cannot recover a sync request", async () => {
    const options = createOptions({ metadata: null });
    const hook = renderHook(() => useCanvasProjectionCommandController(options));

    await act(async () => {
      canvasEventBus.publish("freezone/projection-sync", { projectionKey: "beat:1:4" });
      await Promise.resolve();
    });

    expect(mocks.buildProjectionFromPreset).not.toHaveBeenCalled();
    expect(options.onMessage).toHaveBeenCalledWith("missing request");
    hook.unmount();
  });

  it("reports projection build failures without mutating the local canvas", async () => {
    mocks.buildProjectionFromPreset.mockRejectedValueOnce(new Error("offline"));
    const options = createOptions();
    const hook = renderHook(() => useCanvasProjectionCommandController(options));

    await act(async () => {
      canvasEventBus.publish("freezone/projection-sync", { projectionKey: "beat:1:4" });
      await Promise.resolve();
    });

    expect(mocks.queueLocalFreezoneProjection).not.toHaveBeenCalled();
    expect(options.onMessage).toHaveBeenCalledWith("offline");
    hook.unmount();
  });

  it("routes projection removal success and blocking messages", async () => {
    const options = createOptions();
    const hook = renderHook(() => useCanvasProjectionCommandController(options));

    await act(async () => {
      canvasEventBus.publish("freezone/projection-remove", { projectionKey: "beat:1:4" });
      await Promise.resolve();
    });
    expect(mocks.removeLocalFreezoneProjection).toHaveBeenLastCalledWith(
      "project-a",
      "user_eric",
      "beat:1:4",
    );
    expect(options.onMessage).toHaveBeenLastCalledWith("removed");

    mocks.removeLocalFreezoneProjection.mockReturnValueOnce(false);
    await act(async () => {
      canvasEventBus.publish("freezone/projection-remove", { projectionKey: "beat:1:4" });
      await Promise.resolve();
    });
    expect(options.onMessage).toHaveBeenLastCalledWith("remove blocked");
    hook.unmount();
  });
});
