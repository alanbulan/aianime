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
} from '@/modules/creative_canvas/public';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';
import { hasMeaningfulCanvasEdgeChange } from './canvasChangeIntent';

export interface CanvasEdgeChangeEffectState extends CanvasMutationState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  history: CanvasHistoryState;
  dragHistorySnapshot: CanvasHistorySnapshot | null;
}

export interface CanvasEdgeChangeEffectResult {
  edges: CanvasEdge[];
  history?: CanvasHistoryState;
  dragHistorySnapshot?: CanvasHistorySnapshot | null;
  userEditsSinceHydrate?: number;
  lastMutationSource?: CanvasMutationState['lastMutationSource'];
}

export function applyCanvasEdgeChangeEffects(
  state: CanvasEdgeChangeEffectState,
  changedEdges: CanvasEdge[],
  changes: readonly { type: string }[],
): CanvasEdgeChangeEffectResult {
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
