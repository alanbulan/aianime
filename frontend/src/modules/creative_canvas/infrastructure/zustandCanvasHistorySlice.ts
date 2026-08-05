// Copyright (c) 2026 AI anime
import { normalizeCanvasData, type HydrationGraphEdge } from '../application/canvasDataNormalization';
import { navigateCanvasHistory, type CanvasHistoryDirection, type CanvasHistoryNavigationState } from '../application/canvasHistoryNavigation';
import { normalizeHistory, type CanvasHistorySnapshot, type CanvasHistoryState } from '../domain/canvasHistory';
import { type CanvasToolDialogRequest as ActiveToolDialog } from '../domain/canvasNodeTool';
import { type CanvasEdge, type CanvasNode } from '../domain/canvasNodeData';
import { nodeCatalog } from '../application/canvasNodeCatalog';
import { type CanvasNodeDefaultDataGateway, type CanvasNodeDefaultDataCatalog, type CanvasNodeDefaultDataGateway as ModuleCanvasNodeDefaultDataGateway } from '../application/canvasNodeDefaultData';
import { type HydrationGraphNode } from '../application/canvasNodeHydration';




;

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
            nodes as unknown as HydrationGraphNode[],
            edges as unknown as HydrationGraphEdge[],
            store.nodeDefaultDataGateway as unknown as ModuleCanvasNodeDefaultDataGateway,
            nodeCatalog as unknown as CanvasNodeDefaultDataCatalog,
          ) as unknown as { nodes: CanvasNode[]; edges: CanvasEdge[] },
        ),
      });
    },
  };
}
