// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  DEFAULT_NODE_WIDTH,
  type CanvasNode,
} from './canvasNodes';

export interface CanvasNodeSize {
  width: number;
  height: number;
}

const FALLBACK_NODE_SIZES: Partial<Record<string, CanvasNodeSize>> = {
  [CANVAS_NODE_TYPES.video]: { width: 580, height: 380 },
  [CANVAS_NODE_TYPES.textAnnotation]: { width: 440, height: 320 },
  [CANVAS_NODE_TYPES.audio]: { width: 480, height: 210 },
  [CANVAS_NODE_TYPES.upload]: { width: 320, height: 350 },
};

/** Resolve layout size before a newly spawned node has necessarily been measured. */
export function getNodeSize(node: CanvasNode): CanvasNodeSize {
  const fallback = (node.type && FALLBACK_NODE_SIZES[node.type]) || undefined;
  return {
    width:
      typeof node.measured?.width === 'number'
        ? node.measured.width
        : typeof node.width === 'number'
          ? node.width
          : (fallback?.width ?? DEFAULT_NODE_WIDTH),
    height:
      typeof node.measured?.height === 'number'
        ? node.measured.height
        : typeof node.height === 'number'
          ? node.height
          : (fallback?.height ?? 200),
  };
}

export function resolveAbsolutePosition(
  node: CanvasNode,
  nodeMap: ReadonlyMap<string, CanvasNode>,
): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let currentParentId = node.parentId;
  const visited = new Set<string>();

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = nodeMap.get(currentParentId);
    if (!parent) {
      break;
    }
    x += parent.position.x;
    y += parent.position.y;
    currentParentId = parent.parentId;
  }

  return { x, y };
}

export function getDerivedNodePosition(
  nodes: CanvasNode[],
  sourceNodeId: string,
): { x: number; y: number } {
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  if (!sourceNode) {
    return { x: 100, y: 100 };
  }

  return {
    x: sourceNode.position.x + DEFAULT_NODE_WIDTH + 100,
    y: sourceNode.position.y,
  };
}
