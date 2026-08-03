// Copyright (c) 2026 AI anime
import {
  CANVAS_CONNECTION_NODE_TYPES,
  type CanvasConnectionNodeType,
} from "./canvasConnection";

export interface CanvasMediaReferenceNode {
  id: string;
  type: CanvasConnectionNodeType;
  data: Record<string, unknown>;
}

const REFERENCE_IMAGE_NODE_TYPES = new Set<CanvasConnectionNodeType>([
  CANVAS_CONNECTION_NODE_TYPES.upload,
  CANVAS_CONNECTION_NODE_TYPES.imageEdit,
  CANVAS_CONNECTION_NODE_TYPES.exportImage,
  CANVAS_CONNECTION_NODE_TYPES.storyboardGen,
]);

function mediaUrl(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function referenceImageUrl(
  node: CanvasMediaReferenceNode | undefined | null,
): string | null {
  if (!node) return null;
  if (node.type === CANVAS_CONNECTION_NODE_TYPES.imageGen) {
    const data = node.data;
    return mediaUrl(data.previewImageUrl)
      ?? mediaUrl(data.imageUrl)
      ?? mediaUrl(data.referenceImageUrl);
  }
  if (REFERENCE_IMAGE_NODE_TYPES.has(node.type)) {
    return mediaUrl(node.data.previewImageUrl) ?? mediaUrl(node.data.imageUrl);
  }
  return null;
}

export function referenceVideoUrl(
  node: CanvasMediaReferenceNode | undefined | null,
): string | null {
  if (!node) return null;
  const url = (node.data as { videoUrl?: unknown }).videoUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}

export function submittableImageUrl(
  node: CanvasMediaReferenceNode | undefined | null,
): string | null {
  if (!node) return null;
  if (node.type === CANVAS_CONNECTION_NODE_TYPES.imageGen) {
    const data = node.data;
    return mediaUrl(data.imageUrl) ?? mediaUrl(data.referenceImageUrl);
  }
  if (REFERENCE_IMAGE_NODE_TYPES.has(node.type)) {
    return mediaUrl(node.data.imageUrl);
  }
  return null;
}
