// Copyright (c) 2026 AI anime
import {
  createSnapshot,
  pushSnapshot,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
} from '../domain/canvasHistory';
import { elevateCanvasNodes } from '../domain/canvasNodeLayering';
import {
  setCanvasNodePositions,
  updateCanvasNodePosition,
} from '../domain/canvasNodePositions';
import { trackEdit, type CanvasMutationState } from '@/modules/creative_canvas/public';
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  StoryboardFrameItem,
} from '../domain/canvasNodes';
import {
  reorderStoryboardFrameInGraph,
  updateStoryboardFrameInGraph,
} from '../domain/storyboardFrames';
import { convertCanvasNodeType } from '../application/canvasNodeConversion';
import { createCanvasNode } from '../application/canvasNodeCreation';
import { updateCanvasNodeData } from '../application/canvasNodeData';
import {
  updateCanvasNodeSize,
  type CanvasNodeSizeUpdateOptions,
} from '../application/canvasNodeSize';
import type {
  CanvasNodeDefaultDataGateway,
  NodeFactory,
} from '../application/ports';

export interface CanvasNodeMutationSlice {
  addNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeData>,
  ) => string;
  updateNodeData: (nodeId: string, data: Partial<CanvasNodeData>) => void;
  updateNodeSize: (
    nodeId: string,
    size: { width: number; height: number },
    options?: CanvasNodeSizeUpdateOptions,
  ) => void;
  convertNodeType: (
    nodeId: string,
    newType: CanvasNodeType,
    dataOverrides?: Partial<CanvasNodeData>,
  ) => boolean;
  updateNodePosition: (
    nodeId: string,
    position: { x: number; y: number },
  ) => void;
  setNodePositions: (
    positions: Record<string, { x: number; y: number }>,
  ) => void;
  elevateNodes: (nodeIds: string[], zIndex: number) => void;
  updateStoryboardFrame: (
    nodeId: string,
    frameId: string,
    data: Partial<StoryboardFrameItem>,
  ) => void;
  reorderStoryboardFrame: (
    nodeId: string,
    draggedFrameId: string,
    targetFrameId: string,
  ) => void;
}

interface CanvasNodeMutationState extends CanvasMutationState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  history: CanvasHistoryState;
  dragHistorySnapshot: CanvasHistorySnapshot | null;
}

interface CanvasNodeMutationSliceDependencies {
  nodeDefaultDataGateway: CanvasNodeDefaultDataGateway;
  nodeFactory: NodeFactory;
  getState: () => CanvasNodeMutationState;
  setState: (patch: Partial<CanvasNodeMutationState>) => void;
  updateState: (
    update: (
      state: CanvasNodeMutationState,
    ) => Partial<CanvasNodeMutationState>,
  ) => void;
}

export function createZustandCanvasNodeMutationSlice(
  dependencies: CanvasNodeMutationSliceDependencies,
): CanvasNodeMutationSlice {
  return {
    addNode(type, position, data = {}) {
      const state = dependencies.getState();
      const node = createCanvasNode(
        type,
        position,
        data,
        dependencies.nodeFactory,
      );
      dependencies.setState({
        nodes: [...state.nodes, node],
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
      return node.id;
    },

    convertNodeType(nodeId, newType, dataOverrides = {}) {
      const state = dependencies.getState();
      const result = convertCanvasNodeType(
        state.nodes,
        nodeId,
        newType,
        dataOverrides,
        dependencies.nodeDefaultDataGateway,
      );
      if (!result.changed) {
        return false;
      }
      dependencies.setState({
        nodes: result.nodes,
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
      return true;
    },

    updateNodeData(nodeId, data) {
      dependencies.updateState((state) => {
        const result = updateCanvasNodeData(state.nodes, nodeId, data);
        if (!result.changed) {
          return {};
        }
        return {
          nodes: result.nodes,
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

    updateNodeSize(nodeId, size, options) {
      dependencies.updateState((state) => {
        const result = updateCanvasNodeSize(state.nodes, nodeId, size, options);
        if (!result.changed) {
          return {};
        }
        return {
          nodes: result.nodes,
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

    updateNodePosition(nodeId, position) {
      dependencies.updateState((state) => {
        const result = updateCanvasNodePosition(state.nodes, nodeId, position);
        return result.changed ? { nodes: result.nodes } : {};
      });
    },

    setNodePositions(positions) {
      dependencies.updateState((state) => {
        const result = setCanvasNodePositions(state.nodes, positions);
        if (!result.changed) {
          return {};
        }
        return {
          nodes: result.nodes,
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

    elevateNodes(nodeIds, zIndex) {
      dependencies.updateState((state) => ({
        nodes: elevateCanvasNodes(state.nodes, nodeIds, zIndex),
      }));
    },

    updateStoryboardFrame(nodeId, frameId, data) {
      dependencies.updateState((state) => {
        const result = updateStoryboardFrameInGraph(
          state.nodes,
          nodeId,
          frameId,
          data,
        );
        if (!result.changed) {
          return {};
        }
        return {
          nodes: result.nodes,
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

    reorderStoryboardFrame(nodeId, draggedFrameId, targetFrameId) {
      dependencies.updateState((state) => {
        const result = reorderStoryboardFrameInGraph(
          state.nodes,
          nodeId,
          draggedFrameId,
          targetFrameId,
        );
        if (!result.changed) {
          return {};
        }
        return {
          nodes: result.nodes,
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
