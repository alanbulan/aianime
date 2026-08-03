// Copyright (c) 2026 AI anime
import {
  createSnapshot,
  pushSnapshot,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
} from '../domain/canvasHistory';
import {
  trackEdit,
  type CanvasMutationState,
} from '../domain/canvasMutation';
import { hasMeaningfulCanvasEdgeChange } from '../domain/canvasChangeIntent';

export interface CanvasEdgeChangeEffectState<TNode, TEdge>
  extends CanvasMutationState {
  nodes: TNode[];
  edges: TEdge[];
  history: CanvasHistoryState<TNode, TEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<TNode, TEdge> | null;
}

export interface CanvasEdgeChangeEffectResult<TNode, TEdge> {
  edges: TEdge[];
  history?: CanvasHistoryState<TNode, TEdge>;
  dragHistorySnapshot?: CanvasHistorySnapshot<TNode, TEdge> | null;
  userEditsSinceHydrate?: number;
  lastMutationSource?: CanvasMutationState['lastMutationSource'];
}

export function applyCanvasEdgeChangeEffects<TNode, TEdge>(
  state: CanvasEdgeChangeEffectState<TNode, TEdge>,
  changedEdges: TEdge[],
  changes: readonly { type: string }[],
): CanvasEdgeChangeEffectResult<TNode, TEdge> {
  if (!hasMeaningfulCanvasEdgeChange(changes)) {
    return { edges: changedEdges };
  }

  return {
    edges: changedEdges,
    history: {
      past: pushSnapshot(
        state.history.past,
        createSnapshot(state.nodes, state.edges),
      ),
      future: [],
    },
    dragHistorySnapshot: null,
    ...trackEdit(state),
  };
}
