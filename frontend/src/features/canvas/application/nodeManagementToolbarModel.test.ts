// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
} from "@/features/canvas/domain/canvasNodes";

import { projectNodeManagementToolbar } from "./nodeManagementToolbarModel";

function node(
  type: CanvasNodeType,
  data: Record<string, unknown>,
): CanvasNode {
  return { id: "node-a", type, position: { x: 0, y: 0 }, data } as CanvasNode;
}

describe("nodeManagementToolbarModel", () => {
  it("projects protected groups to projection removal and sync", () => {
    expect(
      projectNodeManagementToolbar(
        node(CANVAS_NODE_TYPES.group, {
          projection_key: " beat:1:4 ",
          user_spawned: false,
        }),
      ),
    ).toEqual({
      projectionKey: "beat:1:4",
      removalTarget: "projection",
      canCommit: false,
    });
  });

  it("lets ordinary media-bearing nodes delete and commit", () => {
    expect(
      projectNodeManagementToolbar(
        node(CANVAS_NODE_TYPES.upload, {
          imageUrl: "/source.png",
          aspectRatio: "1:1",
        }),
      ),
    ).toEqual({
      projectionKey: null,
      removalTarget: "node",
      canCommit: true,
    });
  });

  it("hides removal for generation, video, and audio nodes", () => {
    expect(
      projectNodeManagementToolbar(
        node(CANVAS_NODE_TYPES.imageGen, { imageUrl: "/generated.png" }),
      ),
    ).toMatchObject({ removalTarget: null, canCommit: true });
    expect(
      projectNodeManagementToolbar(
        node(CANVAS_NODE_TYPES.video, { videoUrl: "/clip.mp4" }),
      ),
    ).toMatchObject({ removalTarget: null, canCommit: true });
    expect(
      projectNodeManagementToolbar(
        node(CANVAS_NODE_TYPES.audio, { audioUrl: null }),
      ),
    ).toMatchObject({ removalTarget: null, canCommit: false });
  });
});
