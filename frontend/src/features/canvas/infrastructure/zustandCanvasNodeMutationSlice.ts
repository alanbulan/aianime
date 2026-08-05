// Copyright (c) 2026 AI anime
import { createSnapshot, elevateCanvasNodes, maybeApplyImageAutoResize, pushSnapshot, reorderStoryboardFrameInGraph, setCanvasNodePositions, trackEdit, updateCanvasNodeSize, updateCanvasNodeData, updateStoryboardFrameInGraph, updateCanvasNodePosition, type CanvasHistorySnapshot, type CanvasHistoryState, type CanvasMutationState, type CanvasNodeSizeUpdateOptions, type CanvasNodeDataUpdatePorts, type StoryboardFrameItem, type StoryboardFrameGraphPorts, type CanvasEdge, type CanvasNode, type CanvasNodeData, type CanvasNodeType } from '@/modules/creative_canvas/public';
import { isStoryboardSplitNode } from '../domain/canvasNodes';
import { nodeCatalog } from '../application/nodeCatalog';
import {
  convertCanvasNodeType,
  type ConversionDefaultDataGateway,
  type ConversionGraphNode,
  type ConversionNodeCatalog,
} from '@/modules/creative_canvas/public';
import {
  createCanvasNode,
  type CreationNodeFactory,
} from '@/modules/creative_canvas/public';
import type {
  CanvasNodeDefaultDataGateway,
  NodeFactory,
} from '../application/ports';

const storyboardFrameGraphPorts = {
  projectNode(node) {
    if (!isStoryboardSplitNode(node)) {
      return null;
    }
    return {
      frames: node.data.frames,
      replaceFrames: (frames) => ({
        ...node,
        data: { ...node.data, frames },
      }),
    };
  },
} satisfies StoryboardFrameGraphPorts<CanvasNode, StoryboardFrameItem>;

const canvasNodeDataUpdatePorts = {
  applyMergedNodeData: (node, data, patch) => maybeApplyImageAutoResize(
    { ...node, data },
    patch,
  ),
} satisfies CanvasNodeDataUpdatePorts<CanvasNode, CanvasNodeData>;

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
  history: CanvasHistoryState<CanvasNode, CanvasEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<CanvasNode, CanvasEdge> | null;
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
        dependencies.nodeFactory as unknown as CreationNodeFactory,
      );
      const canvasNode = node as unknown as CanvasNode;
      dependencies.setState({
        nodes: [...state.nodes, canvasNode],
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
      return canvasNode.id;
    },

    convertNodeType(nodeId, newType, dataOverrides = {}) {
      const state = dependencies.getState();
      const result = convertCanvasNodeType(
        state.nodes as unknown as ConversionGraphNode[],
        nodeId,
        newType,
        nodeCatalog as unknown as ConversionNodeCatalog,
        dataOverrides,
        dependencies.nodeDefaultDataGateway as unknown as ConversionDefaultDataGateway,
      );
      if (!result.changed) {
        return false;
      }
      dependencies.setState({
        nodes: result.nodes as unknown as CanvasNode[],
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
        const result = updateCanvasNodeData(
          state.nodes,
          nodeId,
          data,
          canvasNodeDataUpdatePorts,
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
          storyboardFrameGraphPorts,
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
          storyboardFrameGraphPorts,
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
