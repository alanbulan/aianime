// Copyright (c) 2026 AI anime
import type { EdgeChange, NodeChange } from '@xyflow/react';

import { createCanvasClipboardControllerHook } from '../canvasClipboardComposition';
import { cloneCanvasNodeData } from '../application/canvasNodeData';
import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
} from '../domain/canvasNodeData';
import {
  getNodeSize,
  hasRectCollision,
} from '../domain/canvasGeometry';
import {
  useCanvasGraphInteractionController,
  type CanvasGraphInteractionController,
  type CanvasGraphInteractionControllerOptions,
} from './useCanvasGraphInteractionController';
import type {
  CanvasAltDragPositionCommit,
} from './useCanvasAltDragCopyController';
import type {
  CanvasClipboardController,
  CanvasClipboardControllerOptions,
} from './useCanvasClipboardController';

type ClipboardControllerOptions = CanvasClipboardControllerOptions<
  CanvasNode,
  CanvasEdge,
  CanvasNodeType,
  CanvasNodeData
>;
type GraphInteractionControllerOptions = CanvasGraphInteractionControllerOptions<
  CanvasNode,
  CanvasEdge,
  CanvasNodeType,
  NodeChange<CanvasNode>,
  EdgeChange<CanvasEdge>
>;

function mapCanvasPositionCommit(
  update: CanvasAltDragPositionCommit,
): NodeChange<CanvasNode> {
  return {
    id: update.nodeId,
    type: 'position',
    position: update.position,
    dragging: update.dragging,
  };
}

const noIgnoredCanvasNodeIds = new Set<string>();
const useCanvasClipboardController = createCanvasClipboardControllerHook<
  CanvasNode,
  CanvasEdge,
  CanvasNodeType,
  CanvasNodeData
>({
  duplication: {
    resolveNodeType: (node) => node.type as CanvasNodeType,
    cloneNodeData: cloneCanvasNodeData,
    getNodeSize,
    hasRectCollision: (candidateRect, nodes) =>
      hasRectCollision(candidateRect, nodes, noIgnoredCanvasNodeIds),
  },
  cloneSnapshotNode: (node, state) => ({
    ...node,
    ...state,
    data: cloneCanvasNodeData(node.data),
  }),
  cloneSnapshotEdge: (edge) => ({ ...edge }),
});

export interface CanvasGraphEditingSurfaceControllerOptions {
  nodes: ClipboardControllerOptions['nodes'];
  edges: ClipboardControllerOptions['edges'];
  selectedNodeIds: ClipboardControllerOptions['selectedNodeIds'];
  currentProject: ClipboardControllerOptions['currentProject'];
  getGraph: ClipboardControllerOptions['getGraph'];
  createNode: ClipboardControllerOptions['createNode'];
  applyNodeChanges: GraphInteractionControllerOptions['applyNodeChanges'];
  connectNodes: ClipboardControllerOptions['connectNodes'];
  selectNode: ClipboardControllerOptions['selectNode'];
  updateNodeData: ClipboardControllerOptions['updateNodeData'];
  queueSnapshotPaste: ClipboardControllerOptions['queueSnapshotPaste'];
  elevateNodes: GraphInteractionControllerOptions['elevateNodes'];
  fitGroupToChildren:
    GraphInteractionControllerOptions['fitGroupToChildren'];
  alignNodeChanges:
    GraphInteractionControllerOptions['alignNodeChanges'];
  applyEdgeChanges:
    GraphInteractionControllerOptions['applyEdgeChanges'];
  deleteEdge: GraphInteractionControllerOptions['deleteEdge'];
  clearSnapAlignment:
    GraphInteractionControllerOptions['clearSnapAlignment'];
}

export type CanvasGraphEditingSurfaceController = Omit<
  CanvasClipboardController<CanvasNode, CanvasEdge>,
  'duplicateNodes'
> & CanvasGraphInteractionController<
  CanvasNode,
  CanvasEdge,
  NodeChange<CanvasNode>,
  EdgeChange<CanvasEdge>
>;

export function useCanvasGraphEditingSurfaceController({
  nodes,
  edges,
  selectedNodeIds,
  currentProject,
  getGraph,
  createNode,
  applyNodeChanges,
  connectNodes,
  selectNode,
  updateNodeData,
  queueSnapshotPaste,
  elevateNodes,
  fitGroupToChildren,
  alignNodeChanges,
  applyEdgeChanges,
  deleteEdge,
  clearSnapAlignment,
}: CanvasGraphEditingSurfaceControllerOptions): CanvasGraphEditingSurfaceController {
  const { duplicateNodes, ...clipboard } = useCanvasClipboardController({
    nodes,
    edges,
    selectedNodeIds,
    currentProject,
    getGraph,
    createNode,
    applyNodeChanges,
    connectNodes,
    selectNode,
    updateNodeData,
    queueSnapshotPaste,
  });
  const graphInteraction = useCanvasGraphInteractionController<
    CanvasNode,
    CanvasEdge,
    CanvasNodeType,
    NodeChange<CanvasNode>,
    EdgeChange<CanvasEdge>
  >({
    nodes,
    selectedNodeIds,
    duplicateNodes,
    elevateNodes,
    selectNode,
    getGraph,
    groupNodeType: CANVAS_NODE_TYPES.group,
    mapPositionCommit: mapCanvasPositionCommit,
    fitGroupToChildren,
    alignNodeChanges,
    applyNodeChanges,
    applyEdgeChanges,
    deleteEdge,
    clearSnapAlignment,
  });

  return {
    ...clipboard,
    ...graphInteraction,
  };
}
