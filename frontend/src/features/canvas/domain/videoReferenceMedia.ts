// Copyright (c) 2026 AI anime
import {
  isExportImageNode,
  isImageEditNode,
  isImageGenNode,
  isStoryboardGenNode,
  isUploadNode,
  type CanvasNode,
} from "./canvasNodes";

export function referenceImageUrl(
  node: CanvasNode | undefined | null,
): string | null {
  if (!node) return null;
  if (isImageGenNode(node)) {
    const data = node.data;
    const referenceUrl =
      typeof data.referenceImageUrl === "string" &&
      data.referenceImageUrl.length > 0
        ? data.referenceImageUrl
        : null;
    return data.previewImageUrl || data.imageUrl || referenceUrl;
  }
  if (
    isUploadNode(node) ||
    isImageEditNode(node) ||
    isExportImageNode(node) ||
    isStoryboardGenNode(node)
  ) {
    return node.data.previewImageUrl || node.data.imageUrl || null;
  }
  return null;
}

export function referenceVideoUrl(
  node: CanvasNode | undefined | null,
): string | null {
  if (!node) return null;
  const url = (node.data as { videoUrl?: unknown }).videoUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}

export function submittableImageUrl(
  node: CanvasNode | undefined | null,
): string | null {
  if (!node) return null;
  if (isImageGenNode(node)) {
    const data = node.data;
    const referenceUrl =
      typeof data.referenceImageUrl === "string" &&
      data.referenceImageUrl.length > 0
        ? data.referenceImageUrl
        : null;
    return data.imageUrl || referenceUrl;
  }
  if (
    isUploadNode(node) ||
    isImageEditNode(node) ||
    isExportImageNode(node) ||
    isStoryboardGenNode(node)
  ) {
    return node.data.imageUrl || null;
  }
  return null;
}
