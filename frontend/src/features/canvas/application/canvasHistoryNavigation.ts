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
  resolveActiveToolDialog,
  resolveSelectedNodeId,
  trackEdit,
  type CanvasMutationState,
} from '@/modules/creative_canvas/public';
import type {
  ActiveToolDialog,
  CanvasEdge,
  CanvasNode,
} from '../domain/canvasNodes';

export type CanvasHistoryDirection = 'undo' | 'redo';

export interface CanvasHistoryNavigationState extends CanvasMutationState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  history: CanvasHistoryState;
  dragHistorySnapshot: CanvasHistorySnapshot | null;
}

export interface CanvasHistoryNavigationResult {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  history: CanvasHistoryState;
  dragHistorySnapshot: null;
  userEditsSinceHydrate: number;
  lastMutationSource: CanvasMutationState['lastMutationSource'];
}

export function navigateCanvasHistory(
  state: CanvasHistoryNavigationState,
  direction: CanvasHistoryDirection,
): CanvasHistoryNavigationResult | null {
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
