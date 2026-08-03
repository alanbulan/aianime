// Copyright (c) 2026 AI anime
export interface CanvasLayeredNode {
  id: string;
  zIndex?: number;
  style?: { zIndex?: string | number };
}

export function elevateCanvasNodes<TNode extends CanvasLayeredNode>(
  nodes: TNode[],
  nodeIds: readonly string[],
  zIndex: number,
): TNode[] {
  const nodeIdSet = new Set(nodeIds);
  return nodes.map((node) =>
    nodeIdSet.has(node.id)
      ? {
          ...node,
          zIndex,
          style: { ...(node.style ?? {}), zIndex },
        }
      : node,
  );
}
