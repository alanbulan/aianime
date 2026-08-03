// Copyright (c) 2026 AI anime
export interface CanvasHistorySnapshot<TNode, TEdge> {
  nodes: TNode[];
  edges: TEdge[];
}

export interface CanvasHistoryState<TNode, TEdge> {
  past: CanvasHistorySnapshot<TNode, TEdge>[];
  future: CanvasHistorySnapshot<TNode, TEdge>[];
}

export interface CanvasHistoryTransition<TNode, TEdge> {
  target: CanvasHistorySnapshot<TNode, TEdge>;
  history: CanvasHistoryState<TNode, TEdge>;
}

export interface CanvasInteractionHistoryState<TNode, TEdge> {
  history: CanvasHistoryState<TNode, TEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<TNode, TEdge> | null;
}

export interface CanvasInteractionHistoryIntent {
  hasMeaningfulChange: boolean;
  hasInteractionMove: boolean;
  hasInteractionEnd: boolean;
}

export interface CanvasInteractionHistoryResult<TNode, TEdge>
  extends CanvasInteractionHistoryState<TNode, TEdge> {
  editPushed: boolean;
}

export const MAX_HISTORY_STEPS = 50;

export function createSnapshot<TNode, TEdge>(
  nodes: TNode[],
  edges: TEdge[],
): CanvasHistorySnapshot<TNode, TEdge> {
  return { nodes, edges };
}

export function pushSnapshot<TNode, TEdge>(
  snapshots: CanvasHistorySnapshot<TNode, TEdge>[],
  snapshot: CanvasHistorySnapshot<TNode, TEdge>,
): CanvasHistorySnapshot<TNode, TEdge>[] {
  const last = snapshots[snapshots.length - 1];
  if (last && last.nodes === snapshot.nodes && last.edges === snapshot.edges) {
    return snapshots;
  }

  const next = [...snapshots, snapshot];
  return next.length > MAX_HISTORY_STEPS ? next.slice(-MAX_HISTORY_STEPS) : next;
}

export function normalizeHistory<TNode, TEdge>(
  history: CanvasHistoryState<TNode, TEdge> | undefined,
  normalizeSnapshot: (
    nodes: TNode[],
    edges: TEdge[],
  ) => CanvasHistorySnapshot<TNode, TEdge>,
): CanvasHistoryState<TNode, TEdge> {
  if (!history) {
    return { past: [], future: [] };
  }

  return {
    past: history.past
      .slice(-MAX_HISTORY_STEPS)
      .map((snapshot) => normalizeSnapshot(snapshot.nodes, snapshot.edges)),
    future: history.future
      .slice(-MAX_HISTORY_STEPS)
      .map((snapshot) => normalizeSnapshot(snapshot.nodes, snapshot.edges)),
  };
}

export function recordCanvasInteractionHistory<TNode, TEdge>(
  state: CanvasInteractionHistoryState<TNode, TEdge>,
  current: CanvasHistorySnapshot<TNode, TEdge>,
  intent: CanvasInteractionHistoryIntent,
): CanvasInteractionHistoryResult<TNode, TEdge> {
  let nextHistory = state.history;
  let nextDragHistorySnapshot = state.dragHistorySnapshot;
  let editPushed = false;

  if (intent.hasInteractionMove && !nextDragHistorySnapshot) {
    nextDragHistorySnapshot = current;
  }

  if (intent.hasInteractionEnd) {
    const snapshot = nextDragHistorySnapshot ?? current;
    nextHistory = {
      past: pushSnapshot(state.history.past, snapshot),
      future: [],
    };
    nextDragHistorySnapshot = null;
    editPushed = true;
  } else if (intent.hasMeaningfulChange && !intent.hasInteractionMove) {
    nextHistory = {
      past: pushSnapshot(state.history.past, current),
      future: [],
    };
    nextDragHistorySnapshot = null;
    editPushed = true;
  }

  return {
    history: nextHistory,
    dragHistorySnapshot: nextDragHistorySnapshot,
    editPushed,
  };
}

export function undoHistory<TNode, TEdge>(
  history: CanvasHistoryState<TNode, TEdge>,
  current: CanvasHistorySnapshot<TNode, TEdge>,
): CanvasHistoryTransition<TNode, TEdge> | null {
  const target = history.past[history.past.length - 1];
  if (!target) {
    return null;
  }

  return {
    target,
    history: {
      past: history.past.slice(0, -1),
      future: pushSnapshot(history.future, current),
    },
  };
}

export function redoHistory<TNode, TEdge>(
  history: CanvasHistoryState<TNode, TEdge>,
  current: CanvasHistorySnapshot<TNode, TEdge>,
): CanvasHistoryTransition<TNode, TEdge> | null {
  const target = history.future[history.future.length - 1];
  if (!target) {
    return null;
  }

  return {
    target,
    history: {
      past: pushSnapshot(history.past, current),
      future: history.future.slice(0, -1),
    },
  };
}
