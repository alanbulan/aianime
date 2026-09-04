// Copyright (c) 2026 AI anime
import { createSnapshot, pushSnapshot, type CanvasHistorySnapshot, type CanvasHistoryState } from '../domain/canvasHistory';
import { trackEdit, type CanvasMutationState } from '../domain/canvasMutation';
import { type CanvasToolDialogRequest as ActiveToolDialog } from '../domain/canvasNodeTool';
import { type StoryboardFrameItem } from '../domain/storyboard';
import { type CanvasEdge, type CanvasNode, type CanvasNodeData } from '../domain/canvasNodeData';
import { type NodeFactory } from '../application/canvasGraphPorts';
import { createPanoCaptureNodes, type CanvasPanoCapture, type CanvasPanoCaptureOptions, type PanoCaptureGraphEdge, type PanoCaptureGraphNode, type PanoCaptureNodeFactory } from '../application/panoCaptureNodes';
import { createCanvasDerivedExportNode, createCanvasDerivedUploadNode, createCanvasStoryboardSplitNode, type CanvasDerivedExportNodeOptions, type CanvasStoryboardSplitParameters, type DerivedGraphNode, type DerivedNodeFactory } from '../application/canvasDerivedNodeCreation';
import { duplicateCanvasNodeAsSibling, duplicateCanvasNodesAsSiblings, type DuplicationGraphEdge, type DuplicationGraphNode, type DuplicationNodeFactory } from '../application/canvasNodeDuplication';

import type { Viewport } from '@xyflow/react';


;





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
    parameters?: CanvasStoryboardSplitParameters,
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
  history: CanvasHistoryState<CanvasNode, CanvasEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<CanvasNode, CanvasEdge> | null;
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
        state.nodes as unknown as DuplicationGraphNode[],
        state.edges as unknown as DuplicationGraphEdge[],
        sourceNodeId,
        index,
        dataOverrides,
        dependencies.nodeFactory as unknown as DuplicationNodeFactory,
      );
      if (!result) {
        return null;
      }

      dependencies.setState({
        nodes: result.nodes as unknown as CanvasNode[],
        edges: result.edges as unknown as CanvasEdge[],
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
        state.nodes as unknown as DuplicationGraphNode[],
        state.edges as unknown as DuplicationGraphEdge[],
        nodeIds,
        dependencies.nodeFactory as unknown as DuplicationNodeFactory,
      );
      if (result.createdIds.length === 0) {
        return [];
      }

      dependencies.setState({
        nodes: result.nodes as unknown as CanvasNode[],
        edges: result.edges as unknown as CanvasEdge[],
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
        state.nodes as unknown as PanoCaptureGraphNode[],
        state.edges as unknown as PanoCaptureGraphEdge[],
        sourceNodeId,
        captures,
        options,
        dependencies.nodeFactory as unknown as PanoCaptureNodeFactory,
      );
      if (!result) {
        return null;
      }

      dependencies.setState({
        nodes: result.nodes as unknown as CanvasNode[],
        edges: result.edges as unknown as CanvasEdge[],
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
        state.nodes as unknown as DerivedGraphNode[],
        sourceNodeId,
        imageUrl,
        aspectRatio,
        previewImageUrl,
        dependencies.nodeFactory as unknown as DerivedNodeFactory,
      );
      return commitCreatedNode(state, node as unknown as CanvasNode);
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
          nodes: state.nodes as unknown as DerivedGraphNode[],
          sourceNodeId,
          imageUrl,
          aspectRatio,
          previewImageUrl,
          options,
          viewport: state.currentViewport,
          viewportSize: state.canvasViewportSize,
        },
        dependencies.nodeFactory as unknown as DerivedNodeFactory,
      );
      return commitCreatedNode(state, node as unknown as CanvasNode);
    },

    addStoryboardSplitNode(
      sourceNodeId,
      rows,
      cols,
      frames,
      frameAspectRatio,
      parameters,
    ) {
      const state = dependencies.getState();
      const node = createCanvasStoryboardSplitNode(
        state.nodes as unknown as DerivedGraphNode[],
        sourceNodeId,
        rows,
        cols,
        frames,
        frameAspectRatio,
        dependencies.nodeFactory as unknown as DerivedNodeFactory,
        parameters,
      );
      return commitCreatedNode(state, node as unknown as CanvasNode);
    },
  };
}
