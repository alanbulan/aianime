// Copyright (c) 2026 AI anime
export interface CanvasNodePosition {
  x: number;
  y: number;
}

export interface CanvasPositionedNode {
  id: string;
  position: CanvasNodePosition;
}

export interface CanvasNodePositionResult<TNode extends CanvasPositionedNode> {
  nodes: TNode[];
  changed: boolean;
}

export function updateCanvasNodePosition<TNode extends CanvasPositionedNode>(
  nodes: TNode[],
  nodeId: string,
  position: CanvasNodePosition,
): CanvasNodePositionResult<TNode> {
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

export function setCanvasNodePositions<TNode extends CanvasPositionedNode>(
  nodes: TNode[],
  positions: Readonly<Record<string, CanvasNodePosition>>,
): CanvasNodePositionResult<TNode> {
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
