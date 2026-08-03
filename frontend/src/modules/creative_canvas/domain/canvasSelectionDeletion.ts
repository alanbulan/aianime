// Copyright (c) 2026 AI anime
export interface CanvasSelectionDeletionNode {
  id: string;
}

export interface CanvasSelectionDeletionEdge {
  id: string;
  selected?: boolean;
}

export interface CanvasSelectionDeletionParams<
  TNode extends CanvasSelectionDeletionNode,
  TEdge extends CanvasSelectionDeletionEdge,
> {
  nodes: readonly TNode[];
  edges: readonly TEdge[];
  selectedNodeIds: readonly string[];
  selectedNodeId: string | null;
  isNodeDeletionLocked: (node: TNode) => boolean;
  isEdgeDeletionLocked: (edge: TEdge) => boolean;
}

export interface CanvasSelectionDeletion {
  nodeIds: string[];
  edgeIds: string[];
  hasSelectedTargets: boolean;
}

export function resolveCanvasSelectionDeletion<
  TNode extends CanvasSelectionDeletionNode,
  TEdge extends CanvasSelectionDeletionEdge,
>({
  nodes,
  edges,
  selectedNodeIds,
  selectedNodeId,
  isNodeDeletionLocked,
  isEdgeDeletionLocked,
}: CanvasSelectionDeletionParams<TNode, TEdge>): CanvasSelectionDeletion {
  const requestedNodeIds = selectedNodeIds.length > 0
    ? selectedNodeIds
    : selectedNodeId
      ? [selectedNodeId]
      : [];
  const lockedNodeIds = new Set(
    nodes.filter(isNodeDeletionLocked).map((node) => node.id),
  );
  const selectedEdges = edges.filter((edge) => Boolean(edge.selected));

  return {
    nodeIds: requestedNodeIds.filter((nodeId) => !lockedNodeIds.has(nodeId)),
    edgeIds: selectedEdges
      .filter((edge) => !isEdgeDeletionLocked(edge))
      .map((edge) => edge.id),
    hasSelectedTargets: requestedNodeIds.length > 0 || selectedEdges.length > 0,
  };
}
