// Copyright (c) 2026 AI anime
const PLACEMENT_CONFIRM_CLASS_NAME = 'canvas-node-placement-confirm';

export interface CanvasRenderNode {
  id: string;
  className?: string;
}

export interface CanvasRenderEdge {
  hidden?: boolean;
}

export function projectCanvasNodesForRender<
  TNode extends CanvasRenderNode,
>(
  nodes: TNode[],
  placementConfirmNodeId: string | null,
): TNode[] {
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

export function projectCanvasEdgesForRender<
  TEdge extends CanvasRenderEdge,
>(edges: TEdge[], edgesHidden: boolean): TEdge[] {
  if (!edgesHidden) {
    return edges;
  }
  return edges.map(
    (edge) => (edge.hidden ? edge : { ...edge, hidden: true }),
  );
}
