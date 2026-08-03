// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

import {
  CANVAS_NODE_TYPES,
} from "@/features/canvas/domain/canvasNodes";
import type { StoryboardFrameItem } from "@/modules/creative_canvas/public";
import { useCanvasStore } from "@/features/canvas/canvasStore";

const frames: StoryboardFrameItem[] = [
  { id: "first", imageUrl: "first.png", note: "first", order: 0 },
  { id: "second", imageUrl: "second.png", note: "second", order: 1 },
];

describe("canvasStore storyboard frames", () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData(
      [
        {
          id: "storyboard",
          type: CANVAS_NODE_TYPES.storyboardSplit,
          position: { x: 0, y: 0 },
          data: {
            aspectRatio: "16:9",
            gridRows: 1,
            gridCols: 2,
            frames,
          },
        },
      ],
      [],
    );
  });

  it("pushes one history entry for a frame edit and none for an equal patch", () => {
    useCanvasStore.getState().updateStoryboardFrame(
      "storyboard",
      "first",
      { note: "first" },
    );
    expect(useCanvasStore.getState().history.past).toHaveLength(0);

    useCanvasStore.getState().updateStoryboardFrame(
      "storyboard",
      "first",
      { note: "updated" },
    );
    expect(useCanvasStore.getState().history.past).toHaveLength(1);
    const node = useCanvasStore.getState().nodes[0];
    expect((node?.data.frames as StoryboardFrameItem[])[0]?.note).toBe("updated");
  });

  it("reorders through the public command and records one edit", () => {
    useCanvasStore.getState().reorderStoryboardFrame(
      "storyboard",
      "second",
      "first",
    );

    const node = useCanvasStore.getState().nodes[0];
    const nextFrames = node?.data.frames as StoryboardFrameItem[];
    expect(nextFrames.map((frame) => [frame.id, frame.order])).toEqual([
      ["second", 0],
      ["first", 1],
    ]);
    expect(useCanvasStore.getState().history.past).toHaveLength(1);
  });
});
