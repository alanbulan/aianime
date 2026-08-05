// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

;
import { useCanvasStore } from "@/features/canvas/canvasStore";

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
describe("canvasStore pano capture", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData(
      [
        {
          id: "source",
          type: CANVAS_NODE_TYPES.pano360Viewer,
          position: { x: 10, y: 20 },
          measured: { width: 500, height: 250 },
          selected: true,
          data: {},
        },
      ],
      [],
    );
  });

  it("creates one capture and records one graph edit", () => {
    const captureId = useCanvasStore.getState().addPanoCaptureGroup(
      "source",
      [
        {
          dataUrl: "local",
          uploadedUrl: "/capture.png",
          width: 400,
          height: 200,
          label: "Current",
        },
      ],
    );

    expect(captureId).toBeTruthy();
    const state = useCanvasStore.getState();
    expect(state.selectedNodeId).toBe(captureId);
    expect(state.nodes.find((node) => node.id === captureId)).toMatchObject({
      position: { x: 590, y: 20 },
      width: 320,
      height: 160,
      data: { imageUrl: "/capture.png", aspectRatio: "2:1" },
    });
    expect(state.edges).toContainEqual(
      expect.objectContaining({ source: "source", target: captureId }),
    );
    expect(state.history.past).toHaveLength(1);
  });

  it("returns null without changing state for empty captures", () => {
    expect(
      useCanvasStore.getState().addPanoCaptureGroup("source", []),
    ).toBeNull();
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().history.past).toHaveLength(0);
  });
});
