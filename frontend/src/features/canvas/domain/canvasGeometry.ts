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

export interface CanvasNodePlacementInput {
  nodes: readonly CanvasNode[];
  sourceNodeId: string;
  newNodeWidth: number;
  newNodeHeight: number;
  viewport: { x: number; y: number; zoom: number };
  viewportSize: { width: number; height: number };
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

export function findAvailableNodePosition({
  nodes,
  sourceNodeId,
  newNodeWidth,
  newNodeHeight,
  viewport,
  viewportSize,
}: CanvasNodePlacementInput): { x: number; y: number } {
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  if (!sourceNode) {
    return { x: 100, y: 100 };
  }

  // Placement uses React Flow measurements only; group geometry has different
  // explicit-size and node-type fallback rules.
  const collides = (x: number, y: number, width: number, height: number) =>
    nodes.some((node) => {
      const nodeWidth = node.measured?.width ?? DEFAULT_NODE_WIDTH;
      const nodeHeight = node.measured?.height ?? 200;
      const margin = 8;
      return (
        x < node.position.x + nodeWidth + margin
        && x + width + margin > node.position.x
        && y < node.position.y + nodeHeight + margin
        && y + height + margin > node.position.y
      );
    });

  const sourceWidth = sourceNode.measured?.width ?? DEFAULT_NODE_WIDTH;
  const sourceHeight = sourceNode.measured?.height ?? 200;
  const anchorX = sourceNode.position.x + sourceWidth + 28;
  const anchorY = sourceNode.position.y;

  const zoom = Math.max(0.01, viewport.zoom || 1);
  const hasViewportBounds = viewportSize.width > 0 && viewportSize.height > 0;
  const visibleBounds = hasViewportBounds
    ? {
        minX: -viewport.x / zoom,
        minY: -viewport.y / zoom,
        maxX: -viewport.x / zoom + viewportSize.width / zoom,
        maxY: -viewport.y / zoom + viewportSize.height / zoom,
      }
    : null;

  const overflowAmount = (x: number, y: number): number => {
    if (!visibleBounds) {
      return 0;
    }
    const overLeft = Math.max(0, visibleBounds.minX - x);
    const overTop = Math.max(0, visibleBounds.minY - y);
    const overRight = Math.max(0, x + newNodeWidth - visibleBounds.maxX);
    const overBottom = Math.max(0, y + newNodeHeight - visibleBounds.maxY);
    return overLeft + overTop + overRight + overBottom;
  };

  const stepX = Math.max(newNodeWidth + 12, 110);
  const stepY = Math.max(Math.round(newNodeHeight * 0.35), 54);
  const baseCandidates = [
    { x: anchorX, y: anchorY },
    { x: sourceNode.position.x, y: sourceNode.position.y + sourceHeight + 20 },
    { x: sourceNode.position.x - newNodeWidth - 20, y: sourceNode.position.y },
    { x: sourceNode.position.x, y: sourceNode.position.y - newNodeHeight - 20 },
  ];

  let bestInView: { x: number; y: number; score: number } | null = null;
  let bestOutOfView: { x: number; y: number; score: number } | null = null;

  const evaluateCandidate = (x: number, y: number) => {
    if (collides(x, y, newNodeWidth, newNodeHeight)) {
      return;
    }

    const dx = x - anchorX;
    const dy = y - anchorY;
    const distanceScore = Math.hypot(dx, dy);
    const upwardPenalty = dy < 0 ? Math.abs(dy) * 0.25 : 0;
    const overflow = overflowAmount(x, y);
    const score = distanceScore + upwardPenalty + overflow * 1000;
    const candidate = { x, y, score };

    if (overflow === 0) {
      if (!bestInView || score < bestInView.score) {
        bestInView = candidate;
      }
    } else if (!bestOutOfView || score < bestOutOfView.score) {
      bestOutOfView = candidate;
    }
  };

  for (const base of baseCandidates) {
    evaluateCandidate(base.x, base.y);
  }

  for (let ring = 1; ring <= 8; ring += 1) {
    const offsets = [
      { x: ring, y: 0 },
      { x: ring, y: 1 },
      { x: ring, y: -1 },
      { x: 0, y: ring },
      { x: 0, y: -ring },
      { x: -ring, y: 0 },
      { x: ring, y: 2 },
      { x: ring, y: -2 },
      { x: -ring, y: 1 },
      { x: -ring, y: -1 },
    ];
    for (const offset of offsets) {
      evaluateCandidate(anchorX + offset.x * stepX, anchorY + offset.y * stepY);
    }
  }

  if (!bestInView && visibleBounds) {
    const padding = 8;
    const minX = visibleBounds.minX + padding;
    const maxX = visibleBounds.maxX - newNodeWidth - padding;
    const minY = visibleBounds.minY + padding;
    const maxY = visibleBounds.maxY - newNodeHeight - padding;

    if (maxX >= minX && maxY >= minY) {
      const scanStepX = Math.max(42, Math.round(newNodeWidth * 0.32));
      const scanStepY = Math.max(42, Math.round(newNodeHeight * 0.32));

      for (let y = minY; y <= maxY; y += scanStepY) {
        for (let x = minX; x <= maxX; x += scanStepX) {
          evaluateCandidate(x, y);
        }
      }

      evaluateCandidate(minX, minY);
      evaluateCandidate(maxX, minY);
      evaluateCandidate(minX, maxY);
      evaluateCandidate(maxX, maxY);
    }
  }

  const resolvedCandidate = (bestInView || bestOutOfView) as
    | { x: number; y: number; score: number }
    | null;
  if (resolvedCandidate) {
    return { x: resolvedCandidate.x, y: resolvedCandidate.y };
  }

  return { x: anchorX + 2 * stepX, y: anchorY };
}
