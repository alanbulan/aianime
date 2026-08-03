// Copyright (c) 2026 AI anime
import {
  cloneCanvasNodeData,
  createCanvasClipboardControllerHook,
  getNodeSize,
  hasRectCollision,
  type CanvasClipboardController,
  type CanvasClipboardControllerOptions,
} from '@/modules/creative_canvas/public';
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
} from '../domain/canvasNodes';
import {
  useCanvasGraphInteractionController,
  type CanvasGraphInteractionController,
  type CanvasGraphInteractionControllerOptions,
} from './useCanvasGraphInteractionController';

type ClipboardControllerOptions = CanvasClipboardControllerOptions<
  CanvasNode,
  CanvasEdge,
  CanvasNodeType,
  CanvasNodeData
>;

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
  applyNodeChanges: CanvasGraphInteractionControllerOptions['applyNodeChanges'];
  connectNodes: ClipboardControllerOptions['connectNodes'];
  selectNode: ClipboardControllerOptions['selectNode'];
  updateNodeData: ClipboardControllerOptions['updateNodeData'];
  queueSnapshotPaste: ClipboardControllerOptions['queueSnapshotPaste'];
  elevateNodes: CanvasGraphInteractionControllerOptions['elevateNodes'];
  fitGroupToChildren:
    CanvasGraphInteractionControllerOptions['fitGroupToChildren'];
  alignNodeChanges:
    CanvasGraphInteractionControllerOptions['alignNodeChanges'];
  applyEdgeChanges:
    CanvasGraphInteractionControllerOptions['applyEdgeChanges'];
  deleteEdge: CanvasGraphInteractionControllerOptions['deleteEdge'];
  clearSnapAlignment:
    CanvasGraphInteractionControllerOptions['clearSnapAlignment'];
}

export type CanvasGraphEditingSurfaceController = Omit<
  CanvasClipboardController<CanvasNode, CanvasEdge>,
  'duplicateNodes'
> & CanvasGraphInteractionController;

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
  const graphInteraction = useCanvasGraphInteractionController({
    nodes,
    selectedNodeIds,
    duplicateNodes,
    elevateNodes,
    selectNode,
    getGraph,
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
