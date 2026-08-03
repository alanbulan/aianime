// Copyright (c) 2026 AI anime
import { useCallback } from "react";

import {
  resolveCanvasSelectionDeletion,
  type CanvasSelectionDeletionEdge,
  type CanvasSelectionDeletionNode,
} from "../domain/canvasSelectionDeletion";

export interface CanvasSelectionCommandControllerOptions<
  TNode extends CanvasSelectionDeletionNode = CanvasSelectionDeletionNode,
  TEdge extends CanvasSelectionDeletionEdge = CanvasSelectionDeletionEdge,
> {
  nodes: readonly TNode[];
  selectedNodeIds: readonly string[];
  selectedNodeId: string | null;
  getCurrentEdges: () => readonly TEdge[];
  isNodeDeletionLocked: (node: TNode) => boolean;
  isEdgeDeletionLocked: (edge: TEdge) => boolean;
  groupNodes: (nodeIds: string[]) => unknown;
  deleteEdge: (edgeId: string) => void;
  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;
}

export interface CanvasSelectionCommandController {
  groupSelection: () => void;
  deleteSelection: () => boolean;
}

export function useCanvasSelectionCommandController<
  TNode extends CanvasSelectionDeletionNode,
  TEdge extends CanvasSelectionDeletionEdge,
>({
  nodes,
  selectedNodeIds,
  selectedNodeId,
  getCurrentEdges,
  isNodeDeletionLocked,
  isEdgeDeletionLocked,
  groupNodes,
  deleteEdge,
  deleteNode,
  deleteNodes,
}: CanvasSelectionCommandControllerOptions<
  TNode,
  TEdge
>): CanvasSelectionCommandController {
  const groupSelection = useCallback(() => {
    groupNodes([...selectedNodeIds]);
  }, [groupNodes, selectedNodeIds]);

  const deleteSelection = useCallback((): boolean => {
    const deletion = resolveCanvasSelectionDeletion({
      nodes,
      edges: getCurrentEdges(),
      selectedNodeIds,
      selectedNodeId,
      isNodeDeletionLocked,
      isEdgeDeletionLocked,
    });
    deletion.edgeIds.forEach((edgeId) => deleteEdge(edgeId));
    if (deletion.nodeIds.length === 1) {
      deleteNode(deletion.nodeIds[0]);
    } else if (deletion.nodeIds.length > 1) {
      deleteNodes(deletion.nodeIds);
    }
    return deletion.hasSelectedTargets;
  }, [
    deleteEdge,
    deleteNode,
    deleteNodes,
    getCurrentEdges,
    isEdgeDeletionLocked,
    isNodeDeletionLocked,
    nodes,
    selectedNodeId,
    selectedNodeIds,
  ]);

  return { groupSelection, deleteSelection };
}
