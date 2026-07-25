// Copyright (c) 2026 AI anime
import { scopeProjectionGraphIds } from '@/features/freezone/projectionGraphIds';

import { normalizeEdgesWithNodes } from '../domain/canvasEdgeNormalization';
import type { CanvasHistorySnapshot } from '../domain/canvasHistory';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';
import { normalizeCanvasNodes } from './canvasNodeHydration';

export function normalizeCanvasData(
  rawNodes: CanvasNode[],
  rawEdges: CanvasEdge[],
): CanvasHistorySnapshot {
  const scoped = scopeProjectionGraphIds(rawNodes, rawEdges);
  const nodes = normalizeCanvasNodes(scoped.nodes);
  return {
    nodes,
    edges: normalizeEdgesWithNodes(scoped.edges, nodes),
  };
}
