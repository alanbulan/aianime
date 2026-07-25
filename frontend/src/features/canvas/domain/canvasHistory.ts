// Copyright (c) 2026 AI anime
import type { CanvasEdge, CanvasNode } from './canvasNodes';

export interface CanvasHistorySnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasHistoryState {
  past: CanvasHistorySnapshot[];
  future: CanvasHistorySnapshot[];
}

export interface CanvasHistoryTransition {
  target: CanvasHistorySnapshot;
  history: CanvasHistoryState;
}

export interface CanvasInteractionHistoryState {
  history: CanvasHistoryState;
  dragHistorySnapshot: CanvasHistorySnapshot | null;
}

export interface CanvasInteractionHistoryIntent {
  hasMeaningfulChange: boolean;
  hasInteractionMove: boolean;
  hasInteractionEnd: boolean;
}

export interface CanvasInteractionHistoryResult extends CanvasInteractionHistoryState {
  editPushed: boolean;
}

export const MAX_HISTORY_STEPS = 50;

export function createSnapshot(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): CanvasHistorySnapshot {
  return { nodes, edges };
}

export function pushSnapshot(
  snapshots: CanvasHistorySnapshot[],
  snapshot: CanvasHistorySnapshot,
): CanvasHistorySnapshot[] {
  const last = snapshots[snapshots.length - 1];
  if (last && last.nodes === snapshot.nodes && last.edges === snapshot.edges) {
    return snapshots;
  }

  const next = [...snapshots, snapshot];
  return next.length > MAX_HISTORY_STEPS ? next.slice(-MAX_HISTORY_STEPS) : next;
}

export function normalizeHistory(
  history: CanvasHistoryState | undefined,
  normalizeSnapshot: (
    nodes: CanvasNode[],
    edges: CanvasEdge[],
  ) => CanvasHistorySnapshot,
): CanvasHistoryState {
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

export function recordCanvasInteractionHistory(
  state: CanvasInteractionHistoryState,
  current: CanvasHistorySnapshot,
  intent: CanvasInteractionHistoryIntent,
): CanvasInteractionHistoryResult {
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

export function undoHistory(
  history: CanvasHistoryState,
  current: CanvasHistorySnapshot,
): CanvasHistoryTransition | null {
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

export function redoHistory(
  history: CanvasHistoryState,
  current: CanvasHistorySnapshot,
): CanvasHistoryTransition | null {
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
