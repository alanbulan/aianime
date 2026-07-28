// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from "@/features/canvas/domain/canvasNodes";
import { useCanvasStore } from "@/features/canvas/canvasStore";

function node(
  id: string,
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    measured: { width: 100, height: 100 },
    data: {},
    ...overrides,
  } as CanvasNode;
}

describe("canvasStore group arrangement", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
  });

  it("commits a user arrangement as one undoable edit", () => {
    const group = node("group", { type: CANVAS_NODE_TYPES.group });
    const first = node("first", {
      parentId: group.id,
      position: { x: 400, y: 100 },
    });
    const second = node("second", {
      parentId: group.id,
      position: { x: 0, y: 0 },
    });
    useCanvasStore.getState().setCanvasData([group, first, second], []);

    useCanvasStore.getState().arrangeGroupChildren(group.id, "horizontal");

    const arranged = useCanvasStore.getState();
    expect(arranged.nodes.slice(1).map((item) => item.position)).toEqual([
      { x: 152, y: 34 },
      { x: 20, y: 34 },
    ]);
    expect(arranged.history.past).toHaveLength(1);
    expect(arranged.lastMutationSource).toBe("user_edit");

    expect(arranged.undo()).toBe(true);
    expect(useCanvasStore.getState().nodes.slice(1).map((item) => item.position)).toEqual([
      first.position,
      second.position,
    ]);
  });
});
