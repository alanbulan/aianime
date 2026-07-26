// Copyright (c) 2026 AI anime
import type { CanvasNode } from './canvasNodes';

export function elevateCanvasNodes(
  nodes: CanvasNode[],
  nodeIds: readonly string[],
  zIndex: number,
): CanvasNode[] {
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
