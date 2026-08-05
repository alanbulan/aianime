// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

;


import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
import { useCanvasStore } from "@/modules/creative_canvas/public";
describe("canvasStore node placement", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData(
      [
        {
          id: "source",
          type: CANVAS_NODE_TYPES.upload,
          position: { x: 300, y: 0 },
          measured: { width: 80, height: 80 },
          data: {},
        },
      ],
      [],
    );
    useCanvasStore.getState().setViewportState({ x: 0, y: 0, zoom: 1 });
    useCanvasStore.getState().setCanvasViewportSize({ width: 400, height: 300 });
  });

  it("delegates placement with the current graph and viewport state", () => {
    expect(
      useCanvasStore.getState().findNodePosition("source", 80, 80),
    ).toEqual({ x: 300, y: 100 });
  });
});
