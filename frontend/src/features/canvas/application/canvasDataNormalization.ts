// Copyright (c) 2026 AI anime
import {
  scopeProjectionGraphIds,
  type CanvasHistorySnapshot,
} from '@/modules/creative_canvas/public';

import { normalizeEdgesWithNodes } from '../domain/canvasEdgeNormalization';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';
import { normalizeCanvasNodes } from './canvasNodeHydration';
import type { CanvasNodeDefaultDataGateway } from './ports';

export function normalizeCanvasData(
  rawNodes: CanvasNode[],
  rawEdges: CanvasEdge[],
  nodeDefaultDataGateway?: CanvasNodeDefaultDataGateway,
): CanvasHistorySnapshot<CanvasNode, CanvasEdge> {
  const scoped = scopeProjectionGraphIds(rawNodes, rawEdges);
  const nodes = normalizeCanvasNodes(scoped.nodes, nodeDefaultDataGateway);
  return {
    nodes,
    edges: normalizeEdgesWithNodes(scoped.edges, nodes),
  };
}
