// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

;
import { useCanvasStore } from "@/features/canvas/canvasStore";

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
describe("canvasStore node data", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData(
      [
        {
          id: "image",
          type: CANVAS_NODE_TYPES.exportImage,
          position: { x: 0, y: 0 },
          width: 300,
          height: 300,
          style: { width: 300, height: 300 },
          data: { imageUrl: null, aspectRatio: "1:1" },
        },
      ],
      [],
    );
  });

  it("ignores an equal patch without recording history", () => {
    useCanvasStore.getState().updateNodeData("image", {
      aspectRatio: "1:1",
    });

    expect(useCanvasStore.getState().history.past).toHaveLength(0);
    expect(useCanvasStore.getState().userEditsSinceHydrate).toBe(0);
  });

  it("merges data, auto-resizes the image, and records one edit", () => {
    useCanvasStore.getState().updateNodeData("image", {
      imageUrl: "/wide.png",
      aspectRatio: "2:1",
    });

    const image = useCanvasStore.getState().nodes[0];
    expect(image).toMatchObject({
      width: 600,
      height: 300,
      style: { width: 600, height: 300 },
      data: { imageUrl: "/wide.png", aspectRatio: "2:1" },
    });
    expect(useCanvasStore.getState().history.past).toHaveLength(1);
    expect(useCanvasStore.getState().userEditsSinceHydrate).toBe(1);
  });
});
