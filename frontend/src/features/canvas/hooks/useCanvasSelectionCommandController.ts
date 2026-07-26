// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import { resolveCanvasSelectionDeletion } from '../domain/canvasSelectionDeletion';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';

export interface CanvasSelectionCommandControllerOptions {
  nodes: readonly CanvasNode[];
  selectedNodeIds: readonly string[];
  selectedNodeId: string | null;
  getCurrentEdges: () => readonly CanvasEdge[];
  groupNodes: (nodeIds: string[]) => unknown;
  deleteEdge: (edgeId: string) => void;
  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;
}

export interface CanvasSelectionCommandController {
  groupSelection: () => void;
  deleteSelection: () => boolean;
}

export function useCanvasSelectionCommandController({
  nodes,
  selectedNodeIds,
  selectedNodeId,
  getCurrentEdges,
  groupNodes,
  deleteEdge,
  deleteNode,
  deleteNodes,
}: CanvasSelectionCommandControllerOptions): CanvasSelectionCommandController {
  const groupSelection = useCallback(() => {
    groupNodes([...selectedNodeIds]);
  }, [groupNodes, selectedNodeIds]);

  const deleteSelection = useCallback((): boolean => {
    const deletion = resolveCanvasSelectionDeletion({
      nodes,
      edges: getCurrentEdges(),
      selectedNodeIds,
      selectedNodeId,
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
    nodes,
    selectedNodeId,
    selectedNodeIds,
  ]);

  return { groupSelection, deleteSelection };
}
