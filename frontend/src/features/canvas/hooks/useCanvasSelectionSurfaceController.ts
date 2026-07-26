// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';
import {
  useCanvasMarqueeSelection,
  type CanvasMarqueeSelectionController,
  type CanvasMarqueeSelectionOptions,
} from './useCanvasMarqueeSelection';
import {
  useCanvasSelectionCommandController,
  type CanvasSelectionCommandController,
  type CanvasSelectionCommandControllerOptions,
} from './useCanvasSelectionCommandController';
import {
  useCanvasSelectionSync,
  type CanvasSelectionSyncResult,
} from './useCanvasSelectionSync';

interface CanvasNativeSelectionStorePort {
  setState: (state: { nodesSelectionActive: boolean }) => unknown;
}

interface CanvasSelectionGraph {
  edges: readonly CanvasEdge[];
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
  groupNodes: CanvasSelectionCommandControllerOptions['groupNodes'];
  deleteEdge: CanvasSelectionCommandControllerOptions['deleteEdge'];
  deleteNode: CanvasSelectionCommandControllerOptions['deleteNode'];
  deleteNodes: CanvasSelectionCommandControllerOptions['deleteNodes'];
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
    applyNodeSelectionChanges,
    setNativeSelectionActive,
    setSelectedNodeId,
    onMarqueeStart,
  });
  const selection = useCanvasSelectionSync({
    nodes,
    selectedNodeId,
    setSelectedNodeId,
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
