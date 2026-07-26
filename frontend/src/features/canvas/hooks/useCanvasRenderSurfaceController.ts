// Copyright (c) 2026 AI anime
import { useMemo } from 'react';

import { useEdgeVisibilityStore } from '../ui/edgeVisibilityStore';
import {
  projectCanvasEdgesForRender,
  projectCanvasNodesForRender,
} from '../ui/canvasRenderProjection';
import {
  useCanvasNodePlacementConfirm,
  type CanvasNodePlacementConfirmController,
} from './useCanvasNodePlacementConfirm';

export interface CanvasRenderSurfaceControllerOptions {
  nodes: Parameters<typeof projectCanvasNodesForRender>[0];
  edges: Parameters<typeof projectCanvasEdgesForRender>[0];
}

export interface CanvasRenderSurfaceController {
  renderedNodes: ReturnType<typeof projectCanvasNodesForRender>;
  renderedEdges: ReturnType<typeof projectCanvasEdgesForRender>;
  triggerPlacementConfirm:
    CanvasNodePlacementConfirmController['triggerPlacementConfirm'];
}

export function useCanvasRenderSurfaceController({
  nodes,
  edges,
}: CanvasRenderSurfaceControllerOptions): CanvasRenderSurfaceController {
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
