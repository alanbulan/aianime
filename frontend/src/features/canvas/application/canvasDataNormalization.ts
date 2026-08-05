// Copyright (c) 2026 AI anime
import {
  normalizeEdgesWithNodes,
  scopeProjectionGraphIds,
  type CanvasHistorySnapshot,
  normalizeCanvasNodes,
  type CanvasNodeDefaultDataCatalog,
  type HydrationGraphNode,
} from '@/modules/creative_canvas/public';

import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';
import { nodeCatalog } from './nodeCatalog';
import type { CanvasNodeDefaultDataGateway } from './ports';

export function normalizeCanvasData(
  rawNodes: CanvasNode[],
  rawEdges: CanvasEdge[],
  nodeDefaultDataGateway?: CanvasNodeDefaultDataGateway,
): CanvasHistorySnapshot<CanvasNode, CanvasEdge> {
  const scoped = scopeProjectionGraphIds(rawNodes, rawEdges);
  const nodes = normalizeCanvasNodes(
    scoped.nodes as unknown as HydrationGraphNode[],
    nodeDefaultDataGateway as unknown as
      | import('@/modules/creative_canvas/public').CanvasNodeDefaultDataGateway
      | undefined,
    nodeCatalog as unknown as CanvasNodeDefaultDataCatalog,
  ) as unknown as CanvasNode[];
  return {
    nodes,
    edges: normalizeEdgesWithNodes(scoped.edges, nodes),
  };
}
