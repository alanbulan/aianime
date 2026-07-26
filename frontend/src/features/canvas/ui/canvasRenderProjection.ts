// Copyright (c) 2026 AI anime
import type {
  CanvasEdge,
  CanvasNode,
} from '../domain/canvasNodes';

const PLACEMENT_CONFIRM_CLASS_NAME = 'canvas-node-placement-confirm';

export function projectCanvasNodesForRender(
  nodes: CanvasNode[],
  placementConfirmNodeId: string | null,
): CanvasNode[] {
  if (!placementConfirmNodeId) {
    return nodes;
  }
  return nodes.map((node) => {
    if (node.id !== placementConfirmNodeId) {
      return node;
    }
    return {
      ...node,
      className: [node.className, PLACEMENT_CONFIRM_CLASS_NAME]
        .filter(Boolean)
        .join(' '),
    };
  });
}

export function projectCanvasEdgesForRender(
  edges: CanvasEdge[],
  edgesHidden: boolean,
): CanvasEdge[] {
  if (!edgesHidden) {
    return edges;
  }
  return edges.map(
    (edge) => (edge.hidden ? edge : { ...edge, hidden: true }),
  );
}
