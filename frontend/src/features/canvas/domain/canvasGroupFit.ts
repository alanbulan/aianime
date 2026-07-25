// Copyright (c) 2026 AI anime
import {
  isGroupNode,
  isProtectedProjectionGroupNode,
  isStoryboardGroupNode,
  type CanvasNode,
} from './canvasNodes';
import { getNodeSize } from './canvasGeometry';

export function fitCanvasGroupToChildren(
  nodes: readonly CanvasNode[],
  groupNodeId: string,
): CanvasNode[] | null {
  const group = nodes.find((node) => node.id === groupNodeId);
  if (!isGroupNode(group)) {
    return null;
  }
  const groupStyle = group.style;
  if (
    isProtectedProjectionGroupNode(group)
    || isStoryboardGroupNode(group)
  ) {
    return null;
  }

  const children = nodes.filter((node) => node.parentId === groupNodeId);
  if (children.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const child of children) {
    const size = getNodeSize(child);
    minX = Math.min(minX, child.position.x);
    minY = Math.min(minY, child.position.y);
    maxX = Math.max(maxX, child.position.x + size.width);
    maxY = Math.max(maxY, child.position.y + size.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  const shiftX = Math.max(0, Math.round(20 - minX));
  const shiftY = Math.max(0, Math.round(34 - minY));
  const currentWidth =
    typeof groupStyle?.width === 'number' ? groupStyle.width : 0;
  const currentHeight =
    typeof groupStyle?.height === 'number' ? groupStyle.height : 0;
  const width = Math.max(
    currentWidth,
    Math.round(maxX + shiftX + 20),
  );
  const height = Math.max(
    currentHeight,
    Math.round(maxY + shiftY + 20),
  );
  if (
    shiftX === 0
    && shiftY === 0
    && width === currentWidth
    && height === currentHeight
  ) {
    return null;
  }

  const childIds = new Set(children.map((child) => child.id));
  return nodes.map((node) => {
    if (node.id === groupNodeId) {
      return {
        ...node,
        position: {
          x: node.position.x - shiftX,
          y: node.position.y - shiftY,
        },
        width,
        height,
        style: { ...(node.style ?? {}), width, height },
      };
    }
    if ((shiftX !== 0 || shiftY !== 0) && childIds.has(node.id)) {
      return {
        ...node,
        position: {
          x: node.position.x + shiftX,
          y: node.position.y + shiftY,
        },
      };
    }
    return node;
  });
}
