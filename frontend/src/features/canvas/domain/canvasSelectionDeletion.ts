// Copyright (c) 2026 AI anime
import type { CanvasEdge, CanvasNode } from './canvasNodes';
import {
  isPresetManagedEdge,
  isPresetManagedNode,
} from './mainlineNodeFlags';

export interface CanvasSelectionDeletionParams {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  selectedNodeIds: readonly string[];
  selectedNodeId: string | null;
}

export interface CanvasSelectionDeletion {
  nodeIds: string[];
  edgeIds: string[];
  hasSelectedTargets: boolean;
}

export function resolveCanvasSelectionDeletion({
  nodes,
  edges,
  selectedNodeIds,
  selectedNodeId,
}: CanvasSelectionDeletionParams): CanvasSelectionDeletion {
  const requestedNodeIds = selectedNodeIds.length > 0
    ? selectedNodeIds
    : selectedNodeId
      ? [selectedNodeId]
      : [];
  const lockedNodeIds = new Set(
    nodes.filter(isPresetManagedNode).map((node) => node.id),
  );
  const selectedEdges = edges.filter((edge) => edge.selected);

  return {
    nodeIds: requestedNodeIds.filter((nodeId) => !lockedNodeIds.has(nodeId)),
    edgeIds: selectedEdges
      .filter((edge) => !isPresetManagedEdge(edge))
      .map((edge) => edge.id),
    hasSelectedTargets: requestedNodeIds.length > 0 || selectedEdges.length > 0,
  };
}
