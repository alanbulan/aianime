// Copyright (c) 2026 AI anime
import {
  createSnapshot,
  redoHistory,
  undoHistory,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
} from '../domain/canvasHistory';
import {
  isDeleteToEmpty,
  trackEdit,
  type CanvasMutationState,
} from '../domain/canvasMutation';
import {
  resolveActiveToolDialog,
  resolveSelectedNodeId,
  type CanvasSelectionDialogTarget,
  type CanvasSelectionNode,
} from '../domain/canvasSelection';

export type CanvasHistoryDirection = 'undo' | 'redo';

export interface CanvasHistoryNavigationState<
  TNode extends CanvasSelectionNode,
  TEdge,
  TDialog extends CanvasSelectionDialogTarget,
> extends CanvasMutationState {
  nodes: TNode[];
  edges: TEdge[];
  selectedNodeId: string | null;
  activeToolDialog: TDialog | null;
  history: CanvasHistoryState<TNode, TEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<TNode, TEdge> | null;
}

export interface CanvasHistoryNavigationResult<
  TNode extends CanvasSelectionNode,
  TEdge,
  TDialog extends CanvasSelectionDialogTarget,
> {
  nodes: TNode[];
  edges: TEdge[];
  selectedNodeId: string | null;
  activeToolDialog: TDialog | null;
  history: CanvasHistoryState<TNode, TEdge>;
  dragHistorySnapshot: null;
  userEditsSinceHydrate: number;
  lastMutationSource: CanvasMutationState['lastMutationSource'];
}

export function navigateCanvasHistory<
  TNode extends CanvasSelectionNode,
  TEdge,
  TDialog extends CanvasSelectionDialogTarget,
>(
  state: CanvasHistoryNavigationState<TNode, TEdge, TDialog>,
  direction: CanvasHistoryDirection,
): CanvasHistoryNavigationResult<TNode, TEdge, TDialog> | null {
  const current = createSnapshot(state.nodes, state.edges);
  const transition = direction === 'undo'
    ? undoHistory(state.history, current)
    : redoHistory(state.history, current);
  if (!transition) {
    return null;
  }

  const { target } = transition;
  const mutationSource = isDeleteToEmpty(
    state.nodes.length,
    target.nodes.length,
  )
    ? 'delete_to_empty'
    : 'user_edit';

  return {
    nodes: target.nodes,
    edges: target.edges,
    selectedNodeId: resolveSelectedNodeId(state.selectedNodeId, target.nodes),
    activeToolDialog: resolveActiveToolDialog(
      state.activeToolDialog,
      target.nodes,
    ),
    history: transition.history,
    dragHistorySnapshot: null,
    ...trackEdit(state, mutationSource),
  };
}
