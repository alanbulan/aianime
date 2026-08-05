// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

;
import { useCanvasStore } from "@/features/canvas/canvasStore";

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
describe("canvasStore node positions", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData(
      [
        {
          id: "node",
          type: CANVAS_NODE_TYPES.upload,
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      [],
    );
  });

  it("updates one exact position without adding undo history", () => {
    useCanvasStore.getState().updateNodePosition("node", {
      x: 12.25,
      y: 34.75,
    });

    expect(useCanvasStore.getState().nodes[0]?.position).toEqual({
      x: 12.25,
      y: 34.75,
    });
    expect(useCanvasStore.getState().history.past).toHaveLength(0);
  });

  it("rounds a batch layout and records exactly one undo step", () => {
    useCanvasStore.getState().setNodePositions({
      node: { x: 12.25, y: 34.75 },
    });

    expect(useCanvasStore.getState().nodes[0]?.position).toEqual({
      x: 12,
      y: 35,
    });
    expect(useCanvasStore.getState().history.past).toHaveLength(1);

    useCanvasStore.getState().setNodePositions({
      node: { x: 12.4, y: 35.4 },
    });
    expect(useCanvasStore.getState().history.past).toHaveLength(1);
  });
});
