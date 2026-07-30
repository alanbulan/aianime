// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from "@/features/canvas/domain/canvasNodes";

import { projectImageNodeToolbar } from "./imageNodeToolbarModel";

function node(
  type: CanvasNode["type"],
  data: Record<string, unknown>,
): CanvasNode {
  return {
    id: "image-a",
    type,
    position: { x: 0, y: 0 },
    data,
  } as CanvasNode;
}

describe("imageNodeToolbarModel", () => {
  it("projects a visible unlocked toolbar from the canonical image source", () => {
    expect(
      projectImageNodeToolbar(
        node(CANVAS_NODE_TYPES.imageGen, {
          imageUrl: null,
          previewImageUrl: "/preview.png",
          referenceImageUrl: "/reference.png",
        }),
        false,
      ),
    ).toEqual({
      visible: true,
      imageSource: "/preview.png",
      canRotate: true,
    });
  });

  it("hides image-edit and empty nodes while locking in-place rotation", () => {
    expect(
      projectImageNodeToolbar(
        node(CANVAS_NODE_TYPES.upload, {
          imageUrl: "/source.png",
          aspectRatio: "1:1",
        }),
        true,
      ),
    ).toMatchObject({ visible: true, canRotate: false });
    expect(
      projectImageNodeToolbar(
        node(CANVAS_NODE_TYPES.imageEdit, {
          imageUrl: "/source.png",
        }),
        false,
      ),
    ).toEqual({ visible: false, imageSource: null, canRotate: false });
    expect(
      projectImageNodeToolbar(
        node(CANVAS_NODE_TYPES.upload, {
          imageUrl: null,
          aspectRatio: "1:1",
        }),
        false,
      ),
    ).toEqual({ visible: false, imageSource: null, canRotate: false });
  });
});
