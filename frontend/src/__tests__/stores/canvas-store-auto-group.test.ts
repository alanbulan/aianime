// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

;
import { useCanvasStore } from "@/features/canvas/canvasStore";

import { CANVAS_NODE_TYPES, type CanvasNode } from "@/modules/creative_canvas/public";
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

describe("canvasStore automatic grouping", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
  });

  it("creates one named group transaction for a free source", () => {
    const source = node("source", { position: { x: 100, y: 100 } });
    const spawned = node("spawned", { position: { x: 300, y: 100 } });
    useCanvasStore.getState().setCanvasData([source, spawned], []);

    const groupId = useCanvasStore.getState().autoGroupSpawn(
      source.id,
      [spawned.id],
      { label: "派生结果组" },
    );

    expect(groupId).not.toBeNull();
    const state = useCanvasStore.getState();
    expect(state.nodes.find((item) => item.id === groupId)?.data).toMatchObject({
      label: "派生结果组",
      displayName: "派生结果组",
    });
    expect(
      state.nodes
        .filter((item) => item.parentId === groupId)
        .map((item) => item.id),
    ).toEqual([source.id, spawned.id]);
    expect(state.history.past).toHaveLength(1);
  });

  it("appends to an ordinary ancestor and grows it without a second history step", () => {
    const group = node("group", {
      type: CANVAS_NODE_TYPES.group,
      width: 220,
      height: 140,
      style: { width: 220, height: 140 },
    });
    const source = node("source", {
      parentId: group.id,
      position: { x: 20, y: 34 },
    });
    const spawned = node("spawned", {
      position: { x: 400, y: 50 },
      extent: "parent",
    });
    useCanvasStore.getState().setCanvasData([group, source, spawned], []);

    expect(
      useCanvasStore.getState().autoGroupSpawn(source.id, [spawned.id]),
    ).toBe(group.id);

    const state = useCanvasStore.getState();
    expect(state.nodes.find((item) => item.id === spawned.id)).toMatchObject({
      parentId: group.id,
      extent: undefined,
      position: spawned.position,
    });
    expect(state.nodes.find((item) => item.id === group.id)?.width).toBe(520);
    expect(state.history.past).toHaveLength(1);
  });
});
