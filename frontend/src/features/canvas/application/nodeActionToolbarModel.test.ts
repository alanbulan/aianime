// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
} from "@/features/canvas/domain/canvasNodes";

import {
  projectNodeActionGenerationError,
  projectNodeActionStoryboardText,
  resolveNodeActionImageDownloadFilename,
} from "./nodeActionToolbarModel";

function node(
  type: CanvasNodeType,
  data: Record<string, unknown>,
  id = "node-a",
): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data } as CanvasNode;
}

const formatLine = (index: string, content: string) =>
  `${index}: ${content}`;

describe("nodeActionToolbarModel", () => {
  it("projects the preserved ImageGen error only when a displayed error exists", () => {
    expect(
      projectNodeActionGenerationError(
        node(CANVAS_NODE_TYPES.imageGen, {
          generationError: " Provider error ",
          generationErrorDetails: " Raw provider error ",
        }),
        "Fallback error",
      ),
    ).toEqual({ canCopy: true, report: "Raw provider error" });

    expect(
      projectNodeActionGenerationError(
        node(CANVAS_NODE_TYPES.imageGen, {
          generationErrorDetails: "Raw provider error",
        }),
        "Fallback error",
      ),
    ).toEqual({ canCopy: false, report: "Raw provider error" });
  });

  it("builds the complete ExportImage report and hides errors on other nodes", () => {
    const exported = projectNodeActionGenerationError(
      node(CANVAS_NODE_TYPES.exportImage, {
        generationError: "Export failed",
        generationErrorDetails: "Encoder exited with code 1",
        generationDebugContext: {
          sourceType: "imageGen",
          providerId: "provider-a",
          prompt: "A city at night",
        },
      }),
      "Fallback error",
    );

    expect(exported.canCopy).toBe(true);
    expect(exported.report).toContain("Export failed");
    expect(exported.report).toContain("Encoder exited with code 1");
    expect(exported.report).toContain("- Source: imageGen");
    expect(exported.report).toContain("- Provider: provider-a");
    expect(exported.report).toContain("A city at night");

    expect(
      projectNodeActionGenerationError(
        node(CANVAS_NODE_TYPES.video, {
          generationError: "Hidden error",
          generationErrorDetails: "Hidden details",
        }),
        "Fallback error",
      ).canCopy,
    ).toBe(false);
  });

  it("projects StoryboardGen descriptions in source order and sanitizes tags", () => {
    const projected = projectNodeActionStoryboardText(
      node(CANVAS_NODE_TYPES.storyboardGen, {
        frames: [
          { description: "First @图1", referenceIndex: null },
          { description: "Second @ 图2", referenceIndex: null },
        ],
      }),
      true,
      formatLine,
    );

    expect(projected).toEqual({
      canCopy: true,
      text: "01: First\n02: Second",
    });
  });

  it("sorts StoryboardSplit notes by order and preserves the empty-state action", () => {
    const projected = projectNodeActionStoryboardText(
      node(CANVAS_NODE_TYPES.storyboardSplit, {
        frames: [
          { order: 2, note: "Second" },
          { order: 1, note: "First" },
        ],
      }),
      false,
      formatLine,
    );

    expect(projected).toEqual({
      canCopy: true,
      text: "01: First\n02: Second",
    });
    expect(
      projectNodeActionStoryboardText(
        node(CANVAS_NODE_TYPES.storyboardSplit, { frames: [] }),
        false,
        formatLine,
      ),
    ).toEqual({ canCopy: true, text: "" });
  });

  it("resolves image filenames by source name, display name, then node id", () => {
    expect(
      resolveNodeActionImageDownloadFilename(
        node(
          CANVAS_NODE_TYPES.exportImage,
          { sourceFileName: " source.webp ", displayName: "Preview" },
          "image-a",
        ),
      ),
    ).toBe("source.webp");
    expect(
      resolveNodeActionImageDownloadFilename(
        node(
          CANVAS_NODE_TYPES.exportImage,
          { sourceFileName: " ", displayName: " Preview " },
          "image-b",
        ),
      ),
    ).toBe("Preview.png");
    expect(
      resolveNodeActionImageDownloadFilename(
        node(CANVAS_NODE_TYPES.exportImage, {}, "image-c"),
      ),
    ).toBe("node-image-c.png");
  });
});
