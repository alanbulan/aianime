// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from "@/features/canvas/domain/canvasNodes";
import { NODE_TOOL_TYPES } from "@/modules/creative_canvas/public";
import { useCanvasStore } from "@/features/canvas/canvasStore";

describe("canvasStore node deletion", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
  });

  it("commits graph and UI cleanup as one undoable transaction", () => {
    const source: CanvasNode = {
      id: "source",
      type: CANVAS_NODE_TYPES.upload,
      position: { x: 10, y: 20 },
      data: { imageUrl: "/source.png" },
    };
    const target: CanvasNode = {
      id: "target",
      type: CANVAS_NODE_TYPES.imageGen,
      position: { x: 400, y: 20 },
      data: {},
    };
    const edge: CanvasEdge = {
      id: "source-target",
      source: source.id,
      target: target.id,
      sourceHandle: "source",
      targetHandle: "target",
      type: "disconnectableEdge",
    };
    const store = useCanvasStore.getState();
    store.setCanvasData([source, target], [edge]);
    store.setSelectedNode(source.id);
    store.openToolDialog({ nodeId: source.id, toolType: NODE_TOOL_TYPES.crop });

    useCanvasStore.getState().deleteNodes([source.id]);

    const deleted = useCanvasStore.getState();
    expect(deleted.nodes.map((node) => node.id)).toEqual([target.id]);
    expect(deleted.edges).toEqual([]);
    expect(deleted.selectedNodeId).toBeNull();
    expect(deleted.activeToolDialog).toBeNull();
    expect(deleted.history.past).toHaveLength(1);
    expect(deleted.lastMutationSource).toBe("user_edit");

    expect(deleted.undo()).toBe(true);
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual([
      source.id,
      target.id,
    ]);
    expect(useCanvasStore.getState().edges).toEqual([edge]);
  });
});
