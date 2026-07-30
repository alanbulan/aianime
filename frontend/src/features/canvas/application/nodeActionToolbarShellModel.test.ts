// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
} from "@/features/canvas/domain/canvasNodes";

import { projectNodeActionToolbarShell } from "./nodeActionToolbarShellModel";

function node(
  type: CanvasNodeType,
  data: Record<string, unknown>,
): CanvasNode {
  return { id: "node-a", type, position: { x: 0, y: 0 }, data } as CanvasNode;
}

describe("nodeActionToolbarShellModel", () => {
  it("projects ordinary group and preset-lock branches", () => {
    expect(
      projectNodeActionToolbarShell(
        node(CANVAS_NODE_TYPES.group, {
          backgroundColor: "#123456",
          preset_managed: true,
        }),
      ),
    ).toEqual({
      isStoryboardGroup: false,
      isImageEdit: false,
      videoData: null,
      audioData: null,
      isUngroupableGroup: true,
      groupBackgroundColor: "#123456",
      isPresetLocked: true,
    });
  });

  it("projects protected storyboard and media branches", () => {
    expect(
      projectNodeActionToolbarShell(
        node(CANVAS_NODE_TYPES.group, {
          storyboardGroup: true,
          projection_key: "beat:1:4",
          user_spawned: false,
        }),
      ),
    ).toMatchObject({
      isStoryboardGroup: true,
      isUngroupableGroup: false,
      groupBackgroundColor: null,
    });
    expect(
      projectNodeActionToolbarShell(
        node(CANVAS_NODE_TYPES.imageEdit, { imageUrl: "/edited.png" }),
      ),
    ).toMatchObject({ isImageEdit: true, videoData: null, audioData: null });
    expect(
      projectNodeActionToolbarShell(
        node(CANVAS_NODE_TYPES.video, { videoUrl: "/clip.mp4" }),
      ),
    ).toMatchObject({
      isImageEdit: false,
      videoData: { videoUrl: "/clip.mp4" },
      audioData: null,
    });
    expect(
      projectNodeActionToolbarShell(
        node(CANVAS_NODE_TYPES.audio, { audioUrl: "/voice.mp3" }),
      ),
    ).toMatchObject({
      isImageEdit: false,
      videoData: null,
      audioData: { audioUrl: "/voice.mp3" },
    });
  });
});
