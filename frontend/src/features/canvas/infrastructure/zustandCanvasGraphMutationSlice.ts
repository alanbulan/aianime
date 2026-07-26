// Copyright (c) 2026 AI anime
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';

import { createSnapshot, pushSnapshot } from '../domain/canvasHistory';
import { normalizeEdgesWithNodes } from '../domain/canvasEdgeNormalization';
import { trackEdit } from '../domain/canvasMutation';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';
import { applyCanvasEdgeChangeEffects } from '../application/canvasEdgeChangeEffects';
import { prepareCanvasReactFlowConnection } from '../application/canvasEdgeCreation';
import {
  applyCanvasNodeChangeEffects,
  type CanvasNodeChangeEffectState,
} from '../application/canvasNodeChangeEffects';

export interface CanvasGraphMutationSlice {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  replaceEdges: (edges: CanvasEdge[]) => void;
}

interface CanvasGraphMutationSliceStore {
  setState: (
    update: (
      state: CanvasNodeChangeEffectState,
    ) => Partial<CanvasNodeChangeEffectState>,
  ) => void;
}

export function createZustandCanvasGraphMutationSlice(
  store: CanvasGraphMutationSliceStore,
): CanvasGraphMutationSlice {
  return {
    nodes: [],
    edges: [],

    onNodesChange(changes) {
      store.setState((state) => {
        const changedNodes = applyNodeChanges<CanvasNode>(changes, state.nodes);
        return applyCanvasNodeChangeEffects(state, changedNodes, changes);
      });
    },

    onEdgesChange(changes) {
      store.setState((state) => {
        const changedEdges = applyEdgeChanges<CanvasEdge>(changes, state.edges);
        return applyCanvasEdgeChangeEffects(state, changedEdges, changes);
      });
    },

    onConnect(connection) {
      store.setState((state) => {
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
      store.setState((state) => {
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
  };
}
