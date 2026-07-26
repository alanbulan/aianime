// Copyright (c) 2026 AI anime
import {
  useCanvasClipboardController,
  type CanvasClipboardController,
  type CanvasClipboardControllerOptions,
} from './useCanvasClipboardController';
import {
  useCanvasGraphInteractionController,
  type CanvasGraphInteractionController,
  type CanvasGraphInteractionControllerOptions,
} from './useCanvasGraphInteractionController';

export interface CanvasGraphEditingSurfaceControllerOptions {
  nodes: CanvasClipboardControllerOptions['nodes'];
  edges: CanvasClipboardControllerOptions['edges'];
  selectedNodeIds: CanvasClipboardControllerOptions['selectedNodeIds'];
  currentProject: CanvasClipboardControllerOptions['currentProject'];
  getGraph: CanvasClipboardControllerOptions['getGraph'];
  createNode: CanvasClipboardControllerOptions['createNode'];
  applyNodeChanges: CanvasClipboardControllerOptions['applyNodeChanges'];
  connectNodes: CanvasClipboardControllerOptions['connectNodes'];
  selectNode: CanvasClipboardControllerOptions['selectNode'];
  updateNodeData: CanvasClipboardControllerOptions['updateNodeData'];
  queueSnapshotPaste: CanvasClipboardControllerOptions['queueSnapshotPaste'];
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
  CanvasClipboardController,
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
