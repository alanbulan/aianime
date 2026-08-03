// Copyright (c) 2026 AI anime
import { useCallback } from "react";

import {
  collectCanvasNodeIdsInRect,
  type CanvasSelectionNode,
  type CanvasSelectionNodeIntersectsRect,
} from "../domain/canvasSelection";
import type { CanvasSelectionDeletionEdge } from "../domain/canvasSelectionDeletion";
import {
  useCanvasMarqueeSelection,
  type CanvasMarqueeFlowRect,
  type CanvasMarqueeSelectionController,
  type CanvasMarqueeSelectionOptions,
} from "./useCanvasMarqueeSelection";
import {
  useCanvasSelectionCommandController,
  type CanvasSelectionCommandController,
  type CanvasSelectionCommandControllerOptions,
} from "./useCanvasSelectionCommandController";
import {
  useCanvasSelectionSync,
  type CanvasSelectionSyncResult,
} from "./useCanvasSelectionSync";

export interface CanvasSelectionSurfaceNode extends CanvasSelectionNode {
  selected?: boolean;
}

export type CanvasSelectionSurfaceEdge = CanvasSelectionDeletionEdge;

export interface CanvasNativeSelectionStorePort {
  setState: (state: { nodesSelectionActive: boolean }) => unknown;
}

export interface CanvasSelectionGraph<
  TEdge extends CanvasSelectionSurfaceEdge = CanvasSelectionSurfaceEdge,
> {
  edges: readonly TEdge[];
}

export interface CanvasSelectionSurfaceControllerOptions<
  TNode extends CanvasSelectionSurfaceNode = CanvasSelectionSurfaceNode,
  TEdge extends CanvasSelectionSurfaceEdge = CanvasSelectionSurfaceEdge,
> {
  wrapperRef: CanvasMarqueeSelectionOptions<TNode>["wrapperRef"];
  disabled: CanvasMarqueeSelectionOptions<TNode>["disabled"];
  nodes: readonly TNode[];
  coordinatePort: CanvasMarqueeSelectionOptions<TNode>["coordinatePort"];
  nodeIntersectsSelectionRect: CanvasSelectionNodeIntersectsRect<TNode>;
  isImmersiveViewerActive: CanvasMarqueeSelectionOptions<TNode>["isImmersiveViewerActive"];
  applyNodeSelectionChanges: CanvasMarqueeSelectionOptions<TNode>["applyNodeSelectionChanges"];
  nativeSelectionStore: CanvasNativeSelectionStorePort;
  selectedNodeId: string | null;
  setSelectedNodeId: CanvasMarqueeSelectionOptions<TNode>["setSelectedNodeId"];
  onMarqueeStart: CanvasMarqueeSelectionOptions<TNode>["onMarqueeStart"];
  isUploadNode: (node: TNode) => boolean;
  getGraph: () => CanvasSelectionGraph<TEdge>;
  isNodeDeletionLocked: CanvasSelectionCommandControllerOptions<
    TNode,
    TEdge
  >["isNodeDeletionLocked"];
  isEdgeDeletionLocked: CanvasSelectionCommandControllerOptions<
    TNode,
    TEdge
  >["isEdgeDeletionLocked"];
  groupNodes: CanvasSelectionCommandControllerOptions<TNode, TEdge>["groupNodes"];
  deleteEdge: CanvasSelectionCommandControllerOptions<TNode, TEdge>["deleteEdge"];
  deleteNode: CanvasSelectionCommandControllerOptions<TNode, TEdge>["deleteNode"];
  deleteNodes: CanvasSelectionCommandControllerOptions<TNode, TEdge>["deleteNodes"];
}

export interface CanvasSelectionSurfaceController
  extends CanvasMarqueeSelectionController,
    CanvasSelectionSyncResult,
    CanvasSelectionCommandController {}

export function useCanvasSelectionSurfaceController<
  TNode extends CanvasSelectionSurfaceNode,
  TEdge extends CanvasSelectionSurfaceEdge,
>({
  wrapperRef,
  disabled,
  nodes,
  coordinatePort,
  nodeIntersectsSelectionRect,
  isImmersiveViewerActive,
  applyNodeSelectionChanges,
  nativeSelectionStore,
  selectedNodeId,
  setSelectedNodeId,
  onMarqueeStart,
  isUploadNode,
  getGraph,
  isNodeDeletionLocked,
  isEdgeDeletionLocked,
  groupNodes,
  deleteEdge,
  deleteNode,
  deleteNodes,
}: CanvasSelectionSurfaceControllerOptions<
  TNode,
  TEdge
>): CanvasSelectionSurfaceController {
  const collectSelectionNodeIds = useCallback(
    (currentNodes: readonly TNode[], selectionRect: CanvasMarqueeFlowRect) =>
      collectCanvasNodeIdsInRect(
        currentNodes,
        selectionRect,
        nodeIntersectsSelectionRect,
      ),
    [nodeIntersectsSelectionRect],
  );
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
    collectCanvasNodeIdsInRect: collectSelectionNodeIds,
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
    isUploadNode,
  });
  const getCurrentEdges = useCallback(() => getGraph().edges, [getGraph]);
  const commands = useCanvasSelectionCommandController({
    nodes,
    selectedNodeIds: selection.selectedNodeIds,
    selectedNodeId,
    getCurrentEdges,
    isNodeDeletionLocked,
    isEdgeDeletionLocked,
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
