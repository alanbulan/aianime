// Copyright (c) 2026 AI anime
import {
  navigateCanvasHistory,
  normalizeHistory,
  type CanvasHistoryDirection,
  type CanvasHistoryNavigationState,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
  type CanvasToolDialogRequest as ActiveToolDialog,
} from '@/modules/creative_canvas/public';
import { normalizeCanvasData } from '../application/canvasDataNormalization';
import type { CanvasNodeDefaultDataGateway } from '../application/ports';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';

export interface CanvasHistorySlice {
  history: CanvasHistoryState<CanvasNode, CanvasEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<CanvasNode, CanvasEdge> | null;
  undo: () => boolean;
  redo: () => boolean;
  /** Replace persisted history without changing the current graph. */
  restoreHistory: (
    history: CanvasHistoryState<CanvasNode, CanvasEdge>,
  ) => void;
}

interface CanvasHistorySliceStore {
  nodeDefaultDataGateway: CanvasNodeDefaultDataGateway;
  getState: () => CanvasHistoryNavigationState<
    CanvasNode,
    CanvasEdge,
    ActiveToolDialog
  >;
  setState: (
    patch: Partial<CanvasHistoryNavigationState<
      CanvasNode,
      CanvasEdge,
      ActiveToolDialog
    >>,
  ) => void;
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
        history: normalizeHistory(history, (nodes, edges) =>
          normalizeCanvasData(
            nodes,
            edges,
            store.nodeDefaultDataGateway,
          ),
        ),
      });
    },
  };
}
