// Copyright (c) 2026 AI anime
export type CanvasGroupArrangementMode = 'horizontal' | 'vertical' | 'grid';

export interface CanvasGroupArrangementNode {
  id: string;
  parentId?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  style?: { width?: unknown; height?: unknown };
}

export interface CanvasGroupArrangementPorts<
  TNode extends CanvasGroupArrangementNode,
> {
  isGroupNode: (node: TNode) => boolean;
  isProtectedGroupNode: (node: TNode) => boolean;
  isStoryboardGroupNode: (node: TNode) => boolean;
  getNodeSize: (node: TNode) => { width: number; height: number };
}

export function arrangeCanvasGroupChildren<
  TNode extends CanvasGroupArrangementNode,
>(
  nodes: readonly TNode[],
  groupNodeId: string,
  mode: CanvasGroupArrangementMode,
  ports: CanvasGroupArrangementPorts<TNode>,
): TNode[] | null {
  const group = nodes.find((node) => node.id === groupNodeId);
  if (
    !group
    || !ports.isGroupNode(group)
    || ports.isProtectedGroupNode(group)
    || ports.isStoryboardGroupNode(group)
  ) {
    return null;
  }

  const ordered = nodes
    .filter((node) => node.parentId === groupNodeId)
    .map((node) => ({ node, size: ports.getNodeSize(node) }))
    .sort(
      (first, second) =>
        first.node.position.y - second.node.position.y
        || first.node.position.x - second.node.position.x,
    );
  if (ordered.length < 2) {
    return null;
  }

  const targets = new Map<string, { x: number; y: number }>();
  if (mode === 'horizontal') {
    let x = 20;
    for (const item of ordered) {
      targets.set(item.node.id, { x, y: 34 });
      x += item.size.width + 32;
    }
  } else if (mode === 'vertical') {
    let y = 34;
    for (const item of ordered) {
      targets.set(item.node.id, { x: 20, y });
      y += item.size.height + 32;
    }
  } else {
    const cols = Math.ceil(Math.sqrt(ordered.length));
    const cellWidth = Math.max(...ordered.map((item) => item.size.width)) + 32;
    const cellHeight = Math.max(...ordered.map((item) => item.size.height)) + 32;
    ordered.forEach((item, index) => {
      targets.set(item.node.id, {
        x: 20 + (index % cols) * cellWidth,
        y: 34 + Math.floor(index / cols) * cellHeight,
      });
    });
  }

  let maxX = 0;
  let maxY = 0;
  for (const item of ordered) {
    const position = targets.get(item.node.id);
    if (!position) {
      continue;
    }
    maxX = Math.max(maxX, position.x + item.size.width);
    maxY = Math.max(maxY, position.y + item.size.height);
  }
  const width = Math.round(maxX + 20);
  const height = Math.round(maxY + 20);

  return nodes.map((node): TNode => {
    if (node.id === groupNodeId) {
      return {
        ...node,
        width,
        height,
        style: { ...(node.style ?? {}), width, height },
      };
    }
    const position = targets.get(node.id);
    return position ? { ...node, position } : node;
  });
}
