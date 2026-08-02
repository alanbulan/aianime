// Copyright (c) 2026 AI anime
import {
  createSnapshot,
  pushSnapshot,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
} from '../domain/canvasHistory';
import {
  isDeleteToEmpty,
  trackEdit,
  type CanvasMutationSource,
  type CanvasMutationState,
} from '@/modules/creative_canvas/public';
import type {
  ActiveToolDialog,
  CanvasEdge,
  CanvasNode,
} from '../domain/canvasNodes';
import { deleteCanvasNodes } from '../domain/groupSelectionDelete';

export interface CanvasNodeDeletionSlice {
  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;
}

interface CanvasNodeDeletionState extends CanvasMutationState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  history: CanvasHistoryState;
  dragHistorySnapshot: CanvasHistorySnapshot | null;
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
    const result = deleteCanvasNodes(state.nodes, state.edges, nodeIds);
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
