// Copyright (c) 2026 AI anime
import type { Viewport } from '@xyflow/react';

import {
  createSnapshot,
  pushSnapshot,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
} from '../domain/canvasHistory';
import { trackEdit, type CanvasMutationState } from '@/modules/creative_canvas/public';
import type {
  ActiveToolDialog,
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  StoryboardFrameItem,
} from '../domain/canvasNodes';
import {
  createCanvasDerivedExportNode,
  createCanvasDerivedUploadNode,
  createCanvasStoryboardSplitNode,
  type CanvasDerivedExportNodeOptions,
} from '../application/canvasDerivedNodeCreation';
import {
  duplicateCanvasNodeAsSibling,
  duplicateCanvasNodesAsSiblings,
} from '../application/canvasNodeDuplication';
import {
  createPanoCaptureNodes,
  type CanvasPanoCapture,
  type CanvasPanoCaptureOptions,
} from '../application/panoCaptureNodes';
import type { NodeFactory } from '../application/ports';

export interface CanvasDerivedNodeCreationSlice {
  addDerivedUploadNode: (
    sourceNodeId: string,
    imageUrl: string,
    aspectRatio: string,
    previewImageUrl?: string,
  ) => string | null;
  addDerivedExportNode: (
    sourceNodeId: string,
    imageUrl: string,
    aspectRatio: string,
    previewImageUrl?: string,
    options?: CanvasDerivedExportNodeOptions,
  ) => string | null;
  addStoryboardSplitNode: (
    sourceNodeId: string,
    rows: number,
    cols: number,
    frames: StoryboardFrameItem[],
    frameAspectRatio?: string,
  ) => string | null;
  /**
   * Clone a node as a result sibling with the same type, merged data, and
   * upstream connections, stacked at the requested result index.
   */
  duplicateNodeAsSibling: (
    sourceNodeId: string,
    index: number,
    dataOverrides?: Partial<CanvasNodeData>,
  ) => string | null;
  /** Batch-duplicate nodes as one undo step and select the new clones. */
  duplicateNodesAsSiblings: (nodeIds: string[]) => string[];
  /** Create panorama capture result nodes as one undoable graph transaction. */
  addPanoCaptureGroup: (
    sourceNodeId: string,
    captures: CanvasPanoCapture[],
    options?: CanvasPanoCaptureOptions,
  ) => string | null;
}

interface CanvasDerivedNodeCreationState extends CanvasMutationState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  currentViewport: Viewport;
  canvasViewportSize: { width: number; height: number };
  history: CanvasHistoryState;
  dragHistorySnapshot: CanvasHistorySnapshot | null;
}

interface CanvasDerivedNodeCreationSliceDependencies {
  nodeFactory: NodeFactory;
  getState: () => CanvasDerivedNodeCreationState;
  setState: (patch: Partial<CanvasDerivedNodeCreationState>) => void;
}

export function createZustandCanvasDerivedNodeCreationSlice(
  dependencies: CanvasDerivedNodeCreationSliceDependencies,
): CanvasDerivedNodeCreationSlice {
  const commitCreatedNode = (
    state: CanvasDerivedNodeCreationState,
    node: CanvasNode,
  ): string => {
    dependencies.setState({
      nodes: [...state.nodes, node],
      selectedNodeId: node.id,
      activeToolDialog: null,
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
  };

  return {
    duplicateNodeAsSibling(sourceNodeId, index, dataOverrides = {}) {
      const state = dependencies.getState();
      const result = duplicateCanvasNodeAsSibling(
        state.nodes,
        state.edges,
        sourceNodeId,
        index,
        dataOverrides,
        dependencies.nodeFactory,
      );
      if (!result) {
        return null;
      }

      dependencies.setState({
        nodes: result.nodes,
        edges: result.edges,
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
      return result.createdIds[0] ?? null;
    },

    duplicateNodesAsSiblings(nodeIds) {
      const state = dependencies.getState();
      const result = duplicateCanvasNodesAsSiblings(
        state.nodes,
        state.edges,
        nodeIds,
        dependencies.nodeFactory,
      );
      if (result.createdIds.length === 0) {
        return [];
      }

      dependencies.setState({
        nodes: result.nodes,
        edges: result.edges,
        selectedNodeId: result.createdIds.length === 1
          ? result.createdIds[0]
          : null,
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

      return result.createdIds;
    },

    addPanoCaptureGroup(sourceNodeId, captures, options) {
      const state = dependencies.getState();
      const result = createPanoCaptureNodes(
        state.nodes,
        state.edges,
        sourceNodeId,
        captures,
        options,
        dependencies.nodeFactory,
      );
      if (!result) {
        return null;
      }

      dependencies.setState({
        nodes: result.nodes,
        edges: result.edges,
        selectedNodeId: result.selectedNodeId,
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

      return result.selectedNodeId;
    },

    addDerivedUploadNode(sourceNodeId, imageUrl, aspectRatio, previewImageUrl) {
      const state = dependencies.getState();
      const node = createCanvasDerivedUploadNode(
        state.nodes,
        sourceNodeId,
        imageUrl,
        aspectRatio,
        previewImageUrl,
        dependencies.nodeFactory,
      );
      return commitCreatedNode(state, node);
    },

    addDerivedExportNode(
      sourceNodeId,
      imageUrl,
      aspectRatio,
      previewImageUrl,
      options,
    ) {
      const state = dependencies.getState();
      const node = createCanvasDerivedExportNode(
        {
          nodes: state.nodes,
          sourceNodeId,
          imageUrl,
          aspectRatio,
          previewImageUrl,
          options,
          viewport: state.currentViewport,
          viewportSize: state.canvasViewportSize,
        },
        dependencies.nodeFactory,
      );
      return commitCreatedNode(state, node);
    },

    addStoryboardSplitNode(
      sourceNodeId,
      rows,
      cols,
      frames,
      frameAspectRatio,
    ) {
      const state = dependencies.getState();
      const node = createCanvasStoryboardSplitNode(
        state.nodes,
        sourceNodeId,
        rows,
        cols,
        frames,
        frameAspectRatio,
        dependencies.nodeFactory,
      );
      return commitCreatedNode(state, node);
    },
  };
}
