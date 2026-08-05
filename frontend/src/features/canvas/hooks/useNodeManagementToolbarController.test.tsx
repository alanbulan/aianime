// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

;

import { useNodeManagementToolbarController } from "./useNodeManagementToolbarController";

import { CANVAS_NODE_TYPES, type CanvasNode, type CanvasNodeType } from "@/modules/creative_canvas/public";
const mocks = vi.hoisted(() => ({
  deleteNode: vi.fn(),
  publish: vi.fn(),
  publishProjectionRemoval: vi.fn(),
  publishProjectionSync: vi.fn(),
  t: vi.fn((key: string) => key),
  projectionStatus: { current: null as { stale: boolean } | null },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

vi.mock("@/features/canvas/canvasStore", () => ({
  useCanvasStore: (
    selector: (state: { deleteNode: typeof mocks.deleteNode }) => unknown,
  ) => selector({ deleteNode: mocks.deleteNode }),
}));

vi.mock("@/modules/creative_canvas/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/creative_canvas/public")>()),
  publishCanvasCommitRequested: mocks.publish,
  publishCanvasProjectionRemovalRequested: mocks.publishProjectionRemoval,
  publishCanvasProjectionSyncRequested: mocks.publishProjectionSync,
  useCanvasProjectionStatus: () => mocks.projectionStatus.current,
}));

function node(
  type: CanvasNodeType,
  data: Record<string, unknown>,
): CanvasNode {
  return { id: "node-a", type, position: { x: 0, y: 0 }, data } as CanvasNode;
}

describe("useNodeManagementToolbarController", () => {
  beforeEach(() => {
    mocks.deleteNode.mockReset();
    mocks.publish.mockReset();
    mocks.publishProjectionRemoval.mockReset();
    mocks.publishProjectionSync.mockReset();
    mocks.t.mockClear();
    mocks.projectionStatus.current = null;
  });

  it("syncs and removes protected projections through canvas events", () => {
    mocks.projectionStatus.current = { stale: true };
    const { result } = renderHook(() =>
      useNodeManagementToolbarController({
        node: node(CANVAS_NODE_TYPES.group, {
          projection_key: "beat:1:4",
          user_spawned: false,
        }),
      }),
    );

    expect(result.current).toMatchObject({
      projectionKey: "beat:1:4",
      projectionIsStale: true,
      removalTarget: "projection",
    });

    act(() => result.current.syncProjection());
    act(() => result.current.remove());

    expect(mocks.publishProjectionSync).toHaveBeenCalledWith("beat:1:4");
    expect(mocks.publishProjectionRemoval).toHaveBeenCalledWith("beat:1:4");
    expect(mocks.deleteNode).not.toHaveBeenCalled();
  });

  it("deletes ordinary nodes and publishes eligible commits", () => {
    const { result } = renderHook(() =>
      useNodeManagementToolbarController({
        node: node(CANVAS_NODE_TYPES.upload, {
          imageUrl: "/source.png",
          aspectRatio: "1:1",
        }),
      }),
    );

    expect(result.current).toMatchObject({
      removalTarget: "node",
      canCommit: true,
    });

    act(() => result.current.remove());
    act(() => result.current.commit());

    expect(mocks.deleteNode).toHaveBeenCalledWith("node-a");
    expect(mocks.publish).toHaveBeenCalledWith({
      nodeId: "node-a",
    });
  });

  it("does not dispatch unavailable video actions", () => {
    const { result } = renderHook(() =>
      useNodeManagementToolbarController({
        node: node(CANVAS_NODE_TYPES.video, { videoUrl: null }),
      }),
    );

    expect(result.current).toMatchObject({
      projectionKey: null,
      removalTarget: null,
      canCommit: false,
    });

    act(() => result.current.syncProjection());
    act(() => result.current.remove());
    act(() => result.current.commit());

    expect(mocks.deleteNode).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.publishProjectionSync).not.toHaveBeenCalled();
    expect(mocks.publishProjectionRemoval).not.toHaveBeenCalled();
  });
});
