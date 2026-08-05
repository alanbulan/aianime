// Copyright (c) 2026 AI anime
import { normalizeEdgesWithNodes } from "../domain/canvasEdgeNormalization";
import { scopeProjectionGraphIds } from "../domain/projectionGraphIds";
import type { CanvasConnectionNodeType } from "../domain/canvasConnection";
import type {
  CanvasNodeDefaultDataCatalog,
  CanvasNodeDefaultDataGateway,
} from "./canvasNodeDefaultData";
import {
  normalizeCanvasNodes,
  type HydrationGraphNode,
} from "./canvasNodeHydration";

export interface HydrationGraphEdge {
  id: string;
  source: string;
  target: string;
  [key: string]: unknown;
}

export function normalizeCanvasData(
  rawNodes: HydrationGraphNode[],
  rawEdges: HydrationGraphEdge[],
  nodeDefaultDataGateway: CanvasNodeDefaultDataGateway | undefined,
  nodeCatalog: CanvasNodeDefaultDataCatalog,
): { nodes: HydrationGraphNode[]; edges: HydrationGraphEdge[] } {
  const scoped = scopeProjectionGraphIds(rawNodes, rawEdges);
  const nodes = normalizeCanvasNodes(
    scoped.nodes,
    nodeDefaultDataGateway,
    nodeCatalog,
  );
  return {
    nodes,
    edges: normalizeEdgesWithNodes(
      scoped.edges,
      nodes as unknown as Array<{ id: string; type: CanvasConnectionNodeType }>,
    ),
  };
}
