// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

;
import { useCanvasStore } from "@/features/canvas/canvasStore";

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
describe("canvasStore node duplication", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData(
      [
        {
          id: "source",
          type: CANVAS_NODE_TYPES.textAnnotation,
          position: { x: 10, y: 20 },
          measured: { width: 320, height: 100 },
          data: { content: "source", displayName: "Source" },
        },
        {
          id: "upstream",
          type: CANVAS_NODE_TYPES.textAnnotation,
          position: { x: -400, y: 20 },
          data: { content: "upstream" },
        },
      ],
      [
        {
          id: "incoming",
          source: "upstream",
          target: "source",
        },
      ],
    );
  });

  it("duplicates one sibling and records the graph change once", () => {
    const cloneId = useCanvasStore.getState().duplicateNodeAsSibling(
      "source",
      2,
      { content: "override" },
    );

    expect(cloneId).toBeTruthy();
    const state = useCanvasStore.getState();
    expect(state.nodes.find((node) => node.id === cloneId)).toMatchObject({
      position: { x: 10, y: 268 },
      data: { content: "override" },
    });
    expect(state.edges).toContainEqual(
      expect.objectContaining({ source: "upstream", target: cloneId }),
    );
    expect(state.history.past).toHaveLength(1);
  });

  it("duplicates a batch and selects only the clones", () => {
    const cloneIds = useCanvasStore.getState().duplicateNodesAsSiblings([
      "source",
      "upstream",
    ]);

    expect(cloneIds).toHaveLength(2);
    const state = useCanvasStore.getState();
    expect(state.nodes.filter((node) => node.selected).map((node) => node.id)).toEqual(
      cloneIds,
    );
    expect(state.edges).toContainEqual(
      expect.objectContaining({ source: cloneIds[1], target: cloneIds[0] }),
    );
    expect(state.history.past).toHaveLength(1);
  });
});
