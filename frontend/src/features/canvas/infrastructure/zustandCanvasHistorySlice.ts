// Copyright (c) 2026 AI anime
import {
  normalizeHistory,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
} from '../domain/canvasHistory';
import { normalizeCanvasData } from '../application/canvasDataNormalization';
import {
  navigateCanvasHistory,
  type CanvasHistoryDirection,
  type CanvasHistoryNavigationState,
} from '../application/canvasHistoryNavigation';

export interface CanvasHistorySlice {
  history: CanvasHistoryState;
  dragHistorySnapshot: CanvasHistorySnapshot | null;
  undo: () => boolean;
  redo: () => boolean;
  /** Replace persisted history without changing the current graph. */
  restoreHistory: (history: CanvasHistoryState) => void;
}

interface CanvasHistorySliceStore {
  getState: () => CanvasHistoryNavigationState;
  setState: (patch: Partial<CanvasHistoryNavigationState>) => void;
}

export function createZustandCanvasHistorySlice(
  store: CanvasHistorySliceStore,
): CanvasHistorySlice {
  const commitNavigation = (direction: CanvasHistoryDirection): boolean => {
    const result = navigateCanvasHistory(store.getState(), direction);
    if (!result) {
      return false;
    }
    store.setState(result);
    return true;
  };

  return {
    history: { past: [], future: [] },
    dragHistorySnapshot: null,
    undo: () => commitNavigation('undo'),
    redo: () => commitNavigation('redo'),

    restoreHistory(history) {
      store.setState({
        history: normalizeHistory(history, normalizeCanvasData),
      });
    },
  };
}
