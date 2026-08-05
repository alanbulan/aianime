// Copyright (c) 2026 AI anime
import { createSnapshot, deleteCanvasNodes, isDeleteToEmpty, pushSnapshot, resolveAbsolutePosition, trackEdit, type CanvasHistorySnapshot, type CanvasHistoryState, type CanvasMutationSource, type CanvasMutationState, type CanvasToolDialogRequest as ActiveToolDialog, type CanvasEdge, type CanvasNode } from '@/modules/creative_canvas/public';
;

export interface CanvasNodeDeletionSlice {
  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;
}

interface CanvasNodeDeletionState extends CanvasMutationState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  history: CanvasHistoryState<CanvasNode, CanvasEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<CanvasNode, CanvasEdge> | null;
}

interface CanvasNodeDeletionSliceDependencies {
  getState: () => CanvasNodeDeletionState;
  setState: (patch: Partial<CanvasNodeDeletionState>) => void;
}

export function createZustandCanvasNodeDeletionSlice(
  dependencies: CanvasNodeDeletionSliceDependencies,
): CanvasNodeDeletionSlice {
  const commitDeletion = (nodeIds: string[]): void => {
    const state = dependencies.getState();
    const result = deleteCanvasNodes(
      state.nodes,
      state.edges,
      nodeIds,
      resolveAbsolutePosition,
    );
    if (!result) {
      return;
    }

    const editSource: CanvasMutationSource = isDeleteToEmpty(
      state.nodes.length,
      result.nodes.length,
    )
      ? 'delete_to_empty'
      : 'user_edit';

    dependencies.setState({
      nodes: result.nodes,
      edges: result.edges,
      selectedNodeId:
        state.selectedNodeId && result.deletedNodeIds.has(state.selectedNodeId)
          ? null
          : state.selectedNodeId,
      activeToolDialog:
        state.activeToolDialog
          && result.deletedNodeIds.has(state.activeToolDialog.nodeId)
          ? null
          : state.activeToolDialog,
      history: {
        past: pushSnapshot(
          state.history.past,
          createSnapshot(state.nodes, state.edges),
        ),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state, editSource),
    });
  };

  return {
    deleteNode(nodeId) {
      commitDeletion([nodeId]);
    },

    deleteNodes(nodeIds) {
      commitDeletion(nodeIds);
    },
  };
}
