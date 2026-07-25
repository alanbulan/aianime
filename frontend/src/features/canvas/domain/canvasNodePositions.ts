// Copyright (c) 2026 AI anime
import type { CanvasNode } from './canvasNodes';

export interface CanvasNodePosition {
  x: number;
  y: number;
}

export interface CanvasNodePositionResult {
  nodes: CanvasNode[];
  changed: boolean;
}

export function updateCanvasNodePosition(
  nodes: CanvasNode[],
  nodeId: string,
  position: CanvasNodePosition,
): CanvasNodePositionResult {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }
    if (node.position.x === position.x && node.position.y === position.y) {
      return node;
    }

    changed = true;
    return {
      ...node,
      position,
    };
  });

  return {
    nodes: changed ? nextNodes : nodes,
    changed,
  };
}

export function setCanvasNodePositions(
  nodes: CanvasNode[],
  positions: Readonly<Record<string, CanvasNodePosition>>,
): CanvasNodePositionResult {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    const next = positions[node.id];
    if (!next) {
      return node;
    }
    const nextX = Math.round(next.x);
    const nextY = Math.round(next.y);
    if (node.position.x === nextX && node.position.y === nextY) {
      return node;
    }

    changed = true;
    return {
      ...node,
      position: { x: nextX, y: nextY },
    };
  });

  return {
    nodes: changed ? nextNodes : nodes,
    changed,
  };
}
