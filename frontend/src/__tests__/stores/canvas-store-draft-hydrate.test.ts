// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

;
import { NODE_TOOL_TYPES, type CanvasNode } from "@/modules/creative_canvas/public";
import { useCanvasStore } from "@/features/canvas/canvasStore";

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
function sourceNode(): CanvasNode {
  return {
    id: "source",
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: {},
  };
}

describe("canvasStore draft hydrate", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
  });

  it("restores draft content and dirty mutation state atomically", () => {
    useCanvasStore.getState().hydrateCanvasDraft({
      nodes: [
        {
          id: "draft-node",
          type: CANVAS_NODE_TYPES.upload,
          position: { x: 12, y: 34 },
          data: { imageUrl: "/static/draft.png" },
        },
      ],
      edges: [],
      history: {
        past: [
          {
            nodes: [],
            edges: [],
          },
        ],
        future: [],
      },
      mutation: {
        userEditsSinceHydrate: 4,
        lastMutationSource: "manual_clear",
        pendingClearIntent: true,
      },
    });

    const state = useCanvasStore.getState();
    expect(state.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "draft-node" })]),
    );
    expect(state.history.past).toHaveLength(1);
    expect(state.userEditsSinceHydrate).toBe(4);
    expect(state.lastMutationSource).toBe("manual_clear");
    expect(state.pendingClearIntent).toBe(true);
  });

  it("resets mutation state when replacing the loaded canvas", () => {
    useCanvasStore.getState().hydrateCanvasDraft({
      nodes: [sourceNode()],
      edges: [],
      mutation: {
        userEditsSinceHydrate: 4,
        lastMutationSource: "manual_clear",
        pendingClearIntent: true,
      },
    });

    useCanvasStore.getState().setCanvasData([sourceNode()], []);

    expect(useCanvasStore.getState()).toMatchObject({
      userEditsSinceHydrate: 0,
      lastMutationSource: null,
      pendingClearIntent: false,
    });
  });

  it("commits an external edit with history and UI cleanup", () => {
    const source = sourceNode();
    const store = useCanvasStore.getState();
    store.setCanvasData([source], []);
    store.setSelectedNode(source.id);
    store.openToolDialog({ nodeId: source.id, toolType: NODE_TOOL_TYPES.crop });

    useCanvasStore.getState().applyCanvasDataEdit([], []);

    expect(useCanvasStore.getState()).toMatchObject({
      nodes: [],
      selectedNodeId: null,
      activeToolDialog: null,
      lastMutationSource: "delete_to_empty",
    });
    expect(useCanvasStore.getState().history.past).toHaveLength(1);
  });

  it("records and acknowledges a one-shot manual clear intent", () => {
    useCanvasStore.getState().setCanvasData([sourceNode()], []);

    useCanvasStore.getState().clearCanvas();
    expect(useCanvasStore.getState()).toMatchObject({
      nodes: [],
      lastMutationSource: "manual_clear",
      pendingClearIntent: true,
    });
    expect(useCanvasStore.getState().history.past).toHaveLength(1);

    useCanvasStore.getState().acknowledgePendingClear();
    expect(useCanvasStore.getState().pendingClearIntent).toBe(false);
  });
});
