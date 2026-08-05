// Copyright (c) 2026 AI anime
import { createSnapshot, isDeleteToEmpty, normalizeHistory, pushSnapshot, trackEdit, type CanvasHistorySnapshot, type CanvasHistoryState, type CanvasMutationState, type CanvasToolDialogRequest as ActiveToolDialog, type CanvasEdge, type CanvasNode } from '@/modules/creative_canvas/public';
import {
  normalizeCanvasData,
  type CanvasNodeDefaultDataCatalog,
  type CanvasNodeDefaultDataGateway as ModuleCanvasNodeDefaultDataGateway,
  type HydrationGraphEdge,
  type HydrationGraphNode,
} from '@/modules/creative_canvas/public';
;
import { nodeCatalog } from '../application/nodeCatalog';
import type { CanvasNodeDefaultDataGateway } from '../application/ports';

export interface CanvasDraftHydration {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  history?: CanvasHistoryState<CanvasNode, CanvasEdge> | null;
  mutation: CanvasMutationState;
}

export interface CanvasDocumentLifecycleSlice extends CanvasMutationState {
  setCanvasData: (
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    history?: CanvasHistoryState<CanvasNode, CanvasEdge>,
  ) => void;
  applyCanvasDataEdit: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  hydrateCanvasDraft: (draft: CanvasDraftHydration) => void;
  clearCanvas: () => void;
  acknowledgePendingClear: () => void;
}

interface CanvasDocumentLifecycleState extends CanvasMutationState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  history: CanvasHistoryState<CanvasNode, CanvasEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<CanvasNode, CanvasEdge> | null;
}

interface CanvasDocumentLifecycleSliceStore {
  nodeDefaultDataGateway: CanvasNodeDefaultDataGateway;
  setState: (patch: Partial<CanvasDocumentLifecycleState>) => void;
  updateState: (
    update: (
      state: CanvasDocumentLifecycleState,
    ) => Partial<CanvasDocumentLifecycleState>,
  ) => void;
}

export function createZustandCanvasDocumentLifecycleSlice(
  store: CanvasDocumentLifecycleSliceStore,
): CanvasDocumentLifecycleSlice {
  const normalizeData = (nodes: CanvasNode[], edges: CanvasEdge[]) =>
    normalizeCanvasData(
      nodes as unknown as HydrationGraphNode[],
      edges as unknown as HydrationGraphEdge[],
      store.nodeDefaultDataGateway as unknown as ModuleCanvasNodeDefaultDataGateway,
      nodeCatalog as unknown as CanvasNodeDefaultDataCatalog,
    ) as unknown as { nodes: CanvasNode[]; edges: CanvasEdge[] };

  return {
    userEditsSinceHydrate: 0,
    lastMutationSource: null,
    pendingClearIntent: false,

    setCanvasData(nodes, edges, history) {
      const normalizedCanvas = normalizeData(nodes, edges);
      store.setState({
        nodes: normalizedCanvas.nodes,
        edges: normalizedCanvas.edges,
        selectedNodeId: null,
        activeToolDialog: null,
        history: normalizeHistory(history, normalizeData),
        dragHistorySnapshot: null,
        userEditsSinceHydrate: 0,
        lastMutationSource: null,
        pendingClearIntent: false,
      });
    },

    applyCanvasDataEdit(nodes, edges) {
      const normalizedCanvas = normalizeData(nodes, edges);
      store.updateState((state) => {
        const editSource = isDeleteToEmpty(
          state.nodes.length,
          normalizedCanvas.nodes.length,
        )
          ? 'delete_to_empty'
          : 'user_edit';
        return {
          nodes: normalizedCanvas.nodes,
          edges: normalizedCanvas.edges,
          selectedNodeId: null,
          activeToolDialog: null,
          history: {
            past: pushSnapshot(
              state.history.past,
              createSnapshot(state.nodes, state.edges),
            ),
            future: [],
          },
          dragHistorySnapshot: null,
          ...trackEdit(state, editSource),
        };
      });
    },

    hydrateCanvasDraft(draft) {
      const normalizedCanvas = normalizeData(draft.nodes, draft.edges);
      store.setState({
        nodes: normalizedCanvas.nodes,
        edges: normalizedCanvas.edges,
        selectedNodeId: null,
        activeToolDialog: null,
        history: normalizeHistory(
          draft.history ?? undefined,
          normalizeData,
        ),
        dragHistorySnapshot: null,
        userEditsSinceHydrate: draft.mutation.userEditsSinceHydrate,
        lastMutationSource: draft.mutation.lastMutationSource,
        pendingClearIntent: draft.mutation.pendingClearIntent,
      });
    },

    clearCanvas() {
      store.updateState((state) => {
        if (state.nodes.length === 0 && state.edges.length === 0) {
          return {};
        }
        return {
          nodes: [],
          edges: [],
          selectedNodeId: null,
          activeToolDialog: null,
          history: {
            past: pushSnapshot(
              state.history.past,
              createSnapshot(state.nodes, state.edges),
            ),
            future: [],
          },
          dragHistorySnapshot: null,
          ...trackEdit(state, 'manual_clear'),
          pendingClearIntent: true,
        };
      });
    },

    acknowledgePendingClear() {
      store.updateState((state) => (
        state.pendingClearIntent ? { pendingClearIntent: false } : {}
      ));
    },
  };
}
