// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

import { CANVAS_NODE_TYPES } from "@/features/canvas/domain/canvasNodes";
import { useCanvasStore } from "@/stores/canvasStore";

describe("canvasStore node conversion", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData(
      [
        {
          id: "upload",
          type: CANVAS_NODE_TYPES.upload,
          position: { x: 10, y: 20 },
          measured: { width: 320, height: 350 },
          width: 320,
          height: 350,
          style: { width: 320, height: 350, opacity: 0.5 },
          data: { imageUrl: "/old.png", legacyOnly: true },
        },
        {
          id: "target",
          type: CANVAS_NODE_TYPES.textAnnotation,
          position: { x: 500, y: 20 },
          data: {},
        },
      ],
      [
        {
          id: "edge",
          source: "upload",
          target: "target",
        },
      ],
    );
  });

  it("converts in place while preserving graph identity and recording one edit", () => {
    expect(
      useCanvasStore.getState().convertNodeType(
        "upload",
        CANVAS_NODE_TYPES.video,
        { videoUrl: "/video.mp4", displayName: "Video" },
      ),
    ).toBe(true);

    const state = useCanvasStore.getState();
    expect(state.nodes[0]).toMatchObject({
      id: "upload",
      type: CANVAS_NODE_TYPES.video,
      position: { x: 10, y: 20 },
      measured: undefined,
      width: undefined,
      height: undefined,
      style: { width: 320, height: 350, opacity: 0.5 },
      data: { videoUrl: "/video.mp4", displayName: "Video" },
    });
    expect(state.nodes[0]?.data).not.toHaveProperty("legacyOnly");
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]).toMatchObject({ source: "upload", target: "target" });
    expect(state.history.past).toHaveLength(1);
  });

  it("returns false without another edit for an identical or missing target", () => {
    expect(
      useCanvasStore.getState().convertNodeType(
        "upload",
        CANVAS_NODE_TYPES.upload,
      ),
    ).toBe(false);
    expect(
      useCanvasStore.getState().convertNodeType(
        "missing",
        CANVAS_NODE_TYPES.video,
      ),
    ).toBe(false);
    expect(useCanvasStore.getState().history.past).toHaveLength(0);
  });
});
