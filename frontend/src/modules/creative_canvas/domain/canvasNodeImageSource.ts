// Copyright (c) 2026 AI anime
import { CANVAS_CONNECTION_NODE_TYPES } from './canvasConnection';

export interface CanvasNodeImageSourceLike {
  type?: string | null;
  data: unknown;
}

const TOOLABLE_IMAGE_NODE_TYPES = new Set<string>([
  CANVAS_CONNECTION_NODE_TYPES.upload,
  CANVAS_CONNECTION_NODE_TYPES.imageEdit,
  CANVAS_CONNECTION_NODE_TYPES.imageGen,
  CANVAS_CONNECTION_NODE_TYPES.exportImage,
]);

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstImageUrl(...values: unknown[]): string | null {
  return values.find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  ) ?? null;
}

export function isCanvasToolImageSourceNode(
  node: CanvasNodeImageSourceLike | null | undefined,
): boolean {
  return Boolean(node?.type && TOOLABLE_IMAGE_NODE_TYPES.has(node.type));
}

export function resolveCanvasNodeSourceImageUrl(
  node: CanvasNodeImageSourceLike | null | undefined,
): string | null {
  if (!node) return null;
  const data = recordValue(node.data);
  if (node.type === CANVAS_CONNECTION_NODE_TYPES.imageGen) {
    return firstImageUrl(
      data.imageUrl,
      data.previewImageUrl,
      data.referenceImageUrl,
    );
  }
  if (isCanvasToolImageSourceNode(node)) {
    return firstImageUrl(data.imageUrl, data.previewImageUrl);
  }
  return null;
}
