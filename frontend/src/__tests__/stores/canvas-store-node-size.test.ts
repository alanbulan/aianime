// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

;
import { useCanvasStore } from "@/features/canvas/canvasStore";

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
describe("canvasStore node size", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData(
      [
        {
          id: "image",
          type: CANVAS_NODE_TYPES.imageGen,
          position: { x: 0, y: 0 },
          width: 300,
          height: 200,
          style: { width: 300, height: 200 },
          data: { aspectRatio: "3:2", isSizeManuallyAdjusted: false },
        },
      ],
      [],
    );
  });

  it("ignores equal dimensions without recording history", () => {
    useCanvasStore.getState().updateNodeSize("image", {
      width: 300,
      height: 200,
    });

    expect(useCanvasStore.getState().history.past).toHaveLength(0);
    expect(useCanvasStore.getState().userEditsSinceHydrate).toBe(0);
  });

  it("synchronizes size and data while recording one edit", () => {
    useCanvasStore.getState().updateNodeSize(
      "image",
      { width: 420.6, height: 0.2 },
      {
        lockManualSize: true,
        data: { aspectRatio: "16:9" },
      },
    );

    expect(useCanvasStore.getState().nodes[0]).toMatchObject({
      width: 421,
      height: 1,
      style: { width: 421, height: 1 },
      data: { aspectRatio: "16:9", isSizeManuallyAdjusted: true },
    });
    expect(useCanvasStore.getState().history.past).toHaveLength(1);
    expect(useCanvasStore.getState().userEditsSinceHydrate).toBe(1);
  });
});
