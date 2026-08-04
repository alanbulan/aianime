// Copyright (c) 2026 AI anime
import { useMemo } from 'react';

import {
  projectCanvasEdgesForRender,
  projectCanvasNodesForRender,
  type CanvasRenderEdge,
  type CanvasRenderNode,
} from './canvasRenderProjection';
import { useEdgeVisibilityStore } from './edgeVisibilityStore';
import {
  useCanvasNodePlacementConfirm,
  type CanvasNodePlacementConfirmController,
} from './useCanvasNodePlacementConfirm';

export interface CanvasRenderSurfaceControllerOptions<
  TNode extends CanvasRenderNode,
  TEdge extends CanvasRenderEdge,
> {
  nodes: TNode[];
  edges: TEdge[];
}

export interface CanvasRenderSurfaceController<
  TNode extends CanvasRenderNode,
  TEdge extends CanvasRenderEdge,
> {
  renderedNodes: TNode[];
  renderedEdges: TEdge[];
  triggerPlacementConfirm:
    CanvasNodePlacementConfirmController['triggerPlacementConfirm'];
}

export function useCanvasRenderSurfaceController<
  TNode extends CanvasRenderNode,
  TEdge extends CanvasRenderEdge,
>({
  nodes,
  edges,
}: CanvasRenderSurfaceControllerOptions<
  TNode,
  TEdge
>): CanvasRenderSurfaceController<TNode, TEdge> {
  const edgesHidden = useEdgeVisibilityStore((state) => state.hidden);
  const { placementConfirmNodeId, triggerPlacementConfirm } =
    useCanvasNodePlacementConfirm();
  const renderedNodes = useMemo(
    () => projectCanvasNodesForRender(nodes, placementConfirmNodeId),
    [nodes, placementConfirmNodeId],
  );
  const renderedEdges = useMemo(
    () => projectCanvasEdgesForRender(edges, edgesHidden),
    [edges, edgesHidden],
  );

  return {
    renderedNodes,
    renderedEdges,
    triggerPlacementConfirm,
  };
}
