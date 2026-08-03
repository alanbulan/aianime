// Copyright (c) 2026 AI anime
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';

import { normalizeEdgesWithNodes } from '../domain/canvasEdgeNormalization';
import {
  applyCanvasEdgeChangeEffects,
  applyCanvasNodeChangeEffects,
  createSnapshot,
  deleteCanvasEdge,
  pushSnapshot,
  trackEdit,
  type CanvasNodeChangeEffectState,
} from '@/modules/creative_canvas/public';
import type {
  ActiveToolDialog,
  CanvasEdge,
  CanvasNode,
} from '../domain/canvasNodes';
import {
  createCanvasDataEdge,
  createCanvasProgrammaticEdge,
  prepareCanvasReactFlowConnection,
  type CanvasDataEdgeCreationOptions,
} from '../application/canvasEdgeCreation';

export interface CanvasGraphMutationSlice {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  replaceEdges: (edges: CanvasEdge[]) => void;
  addEdge: (source: string, target: string) => string | null;
  addEdgeWithData: (
    source: string,
    target: string,
    data: Record<string, unknown>,
    options?: CanvasDataEdgeCreationOptions,
  ) => string | null;
  deleteEdge: (edgeId: string) => void;
}

type CanvasGraphMutationState = CanvasNodeChangeEffectState<
  CanvasNode,
  CanvasEdge,
  ActiveToolDialog
>;

interface CanvasGraphMutationSliceStore {
  getState: () => CanvasGraphMutationState;
  setState: (patch: Partial<CanvasGraphMutationState>) => void;
  updateState: (
    update: (
      state: CanvasGraphMutationState,
    ) => Partial<CanvasGraphMutationState>,
  ) => void;
}

export function createZustandCanvasGraphMutationSlice(
  store: CanvasGraphMutationSliceStore,
): CanvasGraphMutationSlice {
  return {
    nodes: [],
    edges: [],

    addEdge(source, target) {
      const state = store.getState();
      const result = createCanvasProgrammaticEdge(
        state.nodes,
        state.edges,
        source,
        target,
      );
      if (!result) {
        return null;
      }
      if (!result.created) {
        return result.edgeId;
      }

      store.setState({
        edges: result.edges,
        ...trackEdit(state),
      });
      return result.edgeId;
    },

    addEdgeWithData(source, target, data, options) {
      const state = store.getState();
      const outcome = createCanvasDataEdge(
        state.nodes,
        state.edges,
        source,
        target,
        data,
        options,
      );
      if (!outcome.ok) {
        if (outcome.stage === 'propagation') {
          console.warn(
            '[freezone] rejected propagating edge',
            outcome.reason,
            outcome.edge,
          );
        } else if (outcome.stage === 'role') {
          console.warn(
            '[freezone] rejected role binding edge',
            outcome.reason,
            outcome.edge,
          );
        }
        return null;
      }
      if (!outcome.result.created) {
        return outcome.result.edgeId;
      }

      store.setState({
        edges: outcome.result.edges,
        history: {
          past: pushSnapshot(
            state.history.past,
            createSnapshot(state.nodes, state.edges),
          ),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      });
      return outcome.result.edgeId;
    },

    onNodesChange(changes) {
      store.updateState((state) => {
        const changedNodes = applyNodeChanges<CanvasNode>(changes, state.nodes);
        return applyCanvasNodeChangeEffects(state, changedNodes, changes);
      });
    },

    onEdgesChange(changes) {
      store.updateState((state) => {
        const changedEdges = applyEdgeChanges<CanvasEdge>(changes, state.edges);
        return applyCanvasEdgeChangeEffects(state, changedEdges, changes);
      });
    },

    onConnect(connection) {
      store.updateState((state) => {
        const prepared = prepareCanvasReactFlowConnection(
          state.nodes,
          state.edges,
          connection,
        );
        if (!prepared) {
          return {};
        }
        return {
          edges: addEdge<CanvasEdge>(prepared, state.edges),
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
      });
    },

    replaceEdges(edges) {
      store.updateState((state) => {
        if (state.edges === edges) {
          return {};
        }
        const normalizedEdges = normalizeEdgesWithNodes(edges, state.nodes);
        return {
          edges: normalizedEdges,
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
      });
    },

    deleteEdge(edgeId) {
      store.updateState((state) => {
        const edges = deleteCanvasEdge(state.edges, edgeId);
        if (!edges) {
          return {};
        }
        return {
          edges,
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
      });
    },
  };
}
