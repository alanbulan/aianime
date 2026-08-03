// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  CANVAS_CONNECTION_NODE_TYPES as CANVAS_NODE_TYPES,
  type CanvasConnectionNodeType,
} from "./canvasConnection";
import {
  referenceImageUrl,
  referenceVideoUrl,
  submittableImageUrl,
  type CanvasMediaReferenceNode as CanvasNode,
} from "./videoReferenceMedia";

function node(type: CanvasConnectionNodeType, data: Record<string, unknown>): CanvasNode {
  return {
    id: `${type}-1`,
    type,
    data,
  };
}

describe("videoReferenceMedia", () => {
  it("separates ImageGen display and submission URL priority", () => {
    const generated = node(CANVAS_NODE_TYPES.imageGen, {
      previewImageUrl: "preview.webp",
      imageUrl: "original.png",
      referenceImageUrl: "reference.png",
    });
    expect(referenceImageUrl(generated)).toBe("preview.webp");
    expect(submittableImageUrl(generated)).toBe("original.png");

    const referenceOnly = node(CANVAS_NODE_TYPES.imageGen, {
      previewImageUrl: null,
      imageUrl: null,
      referenceImageUrl: "reference.png",
    });
    expect(referenceImageUrl(referenceOnly)).toBe("reference.png");
    expect(submittableImageUrl(referenceOnly)).toBe("reference.png");

    const previewOnly = node(CANVAS_NODE_TYPES.imageGen, {
      previewImageUrl: "preview.webp",
      imageUrl: null,
      referenceImageUrl: null,
    });
    expect(referenceImageUrl(previewOnly)).toBe("preview.webp");
    expect(submittableImageUrl(previewOnly)).toBeNull();
  });

  it("projects preview for display and original image for submission", () => {
    const imageTypes = [
      CANVAS_NODE_TYPES.upload,
      CANVAS_NODE_TYPES.imageEdit,
      CANVAS_NODE_TYPES.exportImage,
      CANVAS_NODE_TYPES.storyboardGen,
    ];

    for (const type of imageTypes) {
      const imageNode = node(type, {
        previewImageUrl: `${type}-preview.webp`,
        imageUrl: `${type}-original.png`,
      });
      expect(referenceImageUrl(imageNode)).toBe(`${type}-preview.webp`);
      expect(submittableImageUrl(imageNode)).toBe(`${type}-original.png`);
    }
  });

  it("recognizes a video URL independently of node type", () => {
    expect(
      referenceVideoUrl(
        node(CANVAS_NODE_TYPES.upload, { videoUrl: "asset-video.mp4" }),
      ),
    ).toBe("asset-video.mp4");
    expect(
      referenceVideoUrl(
        node(CANVAS_NODE_TYPES.video, { videoUrl: "generated-video.mp4" }),
      ),
    ).toBe("generated-video.mp4");
    expect(
      referenceVideoUrl(node(CANVAS_NODE_TYPES.upload, { videoUrl: "" })),
    ).toBeNull();
    expect(
      referenceVideoUrl(node(CANVAS_NODE_TYPES.upload, { videoUrl: 42 })),
    ).toBeNull();
  });

  it("rejects missing and unsupported image nodes", () => {
    const video = node(CANVAS_NODE_TYPES.video, { imageUrl: "poster.png" });
    expect(referenceImageUrl(null)).toBeNull();
    expect(submittableImageUrl(undefined)).toBeNull();
    expect(referenceImageUrl(video)).toBeNull();
    expect(submittableImageUrl(video)).toBeNull();
  });
});
