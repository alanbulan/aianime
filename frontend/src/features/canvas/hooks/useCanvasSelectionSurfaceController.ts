// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import { isImmersiveViewerActive } from '@/features/viewer-kit/useViewerImmersiveBody';
import {
  collectCanvasNodeIdsInRect,
  useCanvasMarqueeSelection,
  useCanvasSelectionCommandController,
  useCanvasSelectionSync,
  type CanvasMarqueeFlowRect,
  type CanvasMarqueeSelectionController,
  type CanvasMarqueeSelectionOptions,
  type CanvasSelectionCommandController,
  type CanvasSelectionCommandControllerOptions,
  type CanvasSelectionSyncResult,
} from '@/modules/creative_canvas/public';
import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import { canvasNodeIntersectsSelectionRect } from '../domain/canvasGeometry';
import {
  isPresetManagedEdge,
  isPresetManagedNode,
} from '../domain/mainlineNodeFlags';

interface CanvasNativeSelectionStorePort {
  setState: (state: { nodesSelectionActive: boolean }) => unknown;
}

interface CanvasSelectionGraph {
  edges: readonly CanvasEdge[];
}

type CanvasSelectionCommandOptions = CanvasSelectionCommandControllerOptions<
  CanvasNode,
  CanvasEdge
>;

function isCanvasUploadNode(node: CanvasNode): boolean {
  return node.type === CANVAS_NODE_TYPES.upload;
}

function collectCanvasSelectionNodeIds(
  nodes: readonly CanvasNode[],
  selectionRect: CanvasMarqueeFlowRect,
): Set<string> {
  return collectCanvasNodeIdsInRect(
    nodes,
    selectionRect,
    canvasNodeIntersectsSelectionRect,
  );
}

export interface CanvasSelectionSurfaceControllerOptions {
  wrapperRef: CanvasMarqueeSelectionOptions['wrapperRef'];
  disabled: CanvasMarqueeSelectionOptions['disabled'];
  nodes: readonly CanvasNode[];
  coordinatePort: CanvasMarqueeSelectionOptions['coordinatePort'];
  applyNodeSelectionChanges:
    CanvasMarqueeSelectionOptions['applyNodeSelectionChanges'];
  nativeSelectionStore: CanvasNativeSelectionStorePort;
  selectedNodeId: string | null;
  setSelectedNodeId: CanvasMarqueeSelectionOptions['setSelectedNodeId'];
  onMarqueeStart: CanvasMarqueeSelectionOptions['onMarqueeStart'];
  getGraph: () => CanvasSelectionGraph;
  groupNodes: CanvasSelectionCommandOptions['groupNodes'];
  deleteEdge: CanvasSelectionCommandOptions['deleteEdge'];
  deleteNode: CanvasSelectionCommandOptions['deleteNode'];
  deleteNodes: CanvasSelectionCommandOptions['deleteNodes'];
}

export interface CanvasSelectionSurfaceController
  extends CanvasMarqueeSelectionController,
    CanvasSelectionSyncResult,
    CanvasSelectionCommandController {}

export function useCanvasSelectionSurfaceController({
  wrapperRef,
  disabled,
  nodes,
  coordinatePort,
  applyNodeSelectionChanges,
  nativeSelectionStore,
  selectedNodeId,
  setSelectedNodeId,
  onMarqueeStart,
  getGraph,
  groupNodes,
  deleteEdge,
  deleteNode,
  deleteNodes,
}: CanvasSelectionSurfaceControllerOptions): CanvasSelectionSurfaceController {
  const setNativeSelectionActive = useCallback(
    (active: boolean) => {
      nativeSelectionStore.setState({ nodesSelectionActive: active });
    },
    [nativeSelectionStore],
  );
  const marqueeSelection = useCanvasMarqueeSelection({
    wrapperRef,
    disabled,
    nodes,
    coordinatePort,
    collectCanvasNodeIdsInRect: collectCanvasSelectionNodeIds,
    isImmersiveViewerActive,
    applyNodeSelectionChanges,
    setNativeSelectionActive,
    setSelectedNodeId,
    onMarqueeStart,
  });
  const selection = useCanvasSelectionSync({
    nodes,
    selectedNodeId,
    setSelectedNodeId,
    isUploadNode: isCanvasUploadNode,
  });
  const getCurrentEdges = useCallback(
    () => getGraph().edges,
    [getGraph],
  );
  const commands = useCanvasSelectionCommandController({
    nodes,
    selectedNodeIds: selection.selectedNodeIds,
    selectedNodeId,
    getCurrentEdges,
    isNodeDeletionLocked: isPresetManagedNode,
    isEdgeDeletionLocked: isPresetManagedEdge,
    groupNodes,
    deleteEdge,
    deleteNode,
    deleteNodes,
  });

  return {
    ...marqueeSelection,
    ...selection,
    ...commands,
  };
}
