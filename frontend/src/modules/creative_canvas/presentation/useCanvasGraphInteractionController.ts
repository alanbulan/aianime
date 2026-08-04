// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import type { CanvasChangeLike } from '../application/canvasManagedChangeGuard';
import {
  useCanvasAltDragCopyController,
  type CanvasAltDragCopyControllerOptions,
  type CanvasAltDragPositionCommit,
} from './useCanvasAltDragCopyController';
import {
  useCanvasDragLifecycleController,
  type CanvasDragLifecycleController,
} from './useCanvasDragLifecycleController';
import {
  useCanvasGraphChangeController,
  type CanvasGraphChangeController,
  type CanvasGraphChangeControllerOptions,
} from './useCanvasGraphChangeController';
import {
  useCanvasGroupFitDragController,
  type CanvasGroupFitDragControllerOptions,
} from './useCanvasGroupFitDragController';
import { useCanvasLinkedCaptureDragController } from './useCanvasLinkedCaptureDragController';

export interface CanvasGraphInteractionNode<TNodeType> {
  id: string;
  type: TNodeType;
  position: { x: number; y: number };
  parentId?: string;
  data: unknown;
}

export interface CanvasGraphInteractionEdge {
  id: string;
  source: string;
  target: string;
  data?: unknown;
  targetHandle?: unknown;
}

export interface CanvasGraphInteractionControllerOptions<
  TNode extends CanvasGraphInteractionNode<TNodeType>,
  TEdge extends CanvasGraphInteractionEdge,
  TNodeType,
  TNodeChange extends CanvasChangeLike,
  TEdgeChange extends CanvasChangeLike,
> {
  nodes: readonly TNode[];
  selectedNodeIds: readonly string[];
  duplicateNodes: CanvasAltDragCopyControllerOptions<TNode>['duplicateNodes'];
  elevateNodes: CanvasAltDragCopyControllerOptions<TNode>['elevateNodes'];
  selectNode: CanvasAltDragCopyControllerOptions<TNode>['selectNode'];
  getGraph: () => {
    nodes: readonly TNode[];
    edges: readonly TEdge[];
  };
  groupNodeType: TNodeType;
  mapPositionCommit: (update: CanvasAltDragPositionCommit) => TNodeChange;
  fitGroupToChildren:
    CanvasGroupFitDragControllerOptions<TNode>['fitGroupToChildren'];
  alignNodeChanges: CanvasGraphChangeControllerOptions<
    TNode,
    TEdge,
    TNodeChange,
    TEdgeChange
  >['alignNodeChanges'];
  applyNodeChanges: CanvasGraphChangeControllerOptions<
    TNode,
    TEdge,
    TNodeChange,
    TEdgeChange
  >['applyNodeChanges'];
  applyEdgeChanges: CanvasGraphChangeControllerOptions<
    TNode,
    TEdge,
    TNodeChange,
    TEdgeChange
  >['applyEdgeChanges'];
  deleteEdge: CanvasGraphChangeControllerOptions<
    TNode,
    TEdge,
    TNodeChange,
    TEdgeChange
  >['deleteEdge'];
  clearSnapAlignment: () => void;
}

export interface CanvasGraphInteractionController<
  TNode extends CanvasGraphInteractionNode<unknown>,
  TEdge extends CanvasGraphInteractionEdge,
  TNodeChange extends CanvasChangeLike,
  TEdgeChange extends CanvasChangeLike,
> extends CanvasGraphChangeController<TEdge, TNodeChange, TEdgeChange>,
    CanvasDragLifecycleController<TNode> {}

export function useCanvasGraphInteractionController<
  TNode extends CanvasGraphInteractionNode<TNodeType>,
  TEdge extends CanvasGraphInteractionEdge,
  TNodeType,
  TNodeChange extends CanvasChangeLike,
  TEdgeChange extends CanvasChangeLike,
>({
  nodes,
  selectedNodeIds,
  duplicateNodes,
  elevateNodes,
  selectNode,
  getGraph,
  groupNodeType,
  mapPositionCommit,
  fitGroupToChildren,
  alignNodeChanges,
  applyNodeChanges,
  applyEdgeChanges,
  deleteEdge,
  clearSnapAlignment,
}: CanvasGraphInteractionControllerOptions<
  TNode,
  TEdge,
  TNodeType,
  TNodeChange,
  TEdgeChange
>): CanvasGraphInteractionController<TNode, TEdge, TNodeChange, TEdgeChange> {
  const commitNodePositions = useCallback(
    (updates: CanvasAltDragPositionCommit[]) => {
      applyNodeChanges(updates.map(mapPositionCommit));
    },
    [applyNodeChanges, mapPositionCommit],
  );
  const altDragCopy = useCanvasAltDragCopyController({
    nodes,
    selectedNodeIds,
    duplicateNodes,
    elevateNodes,
    commitNodePositions,
    selectNode,
  });
  const groupFitDrag = useCanvasGroupFitDragController({
    getGraph,
    fitGroupToChildren,
  });
  const linkedCaptureDrag = useCanvasLinkedCaptureDragController({
    getGraph,
    groupNodeType,
    commitNodePositions,
  });
  const graphChanges = useCanvasGraphChangeController({
    getGraph,
    isCopyDragActive: altDragCopy.isCopyDragActive,
    alignNodeChanges,
    applyNodeChanges,
    applyEdgeChanges,
    deleteEdge,
  });
  const dragLifecycle = useCanvasDragLifecycleController<TNode>({
    beginGroupFitNodeDrag: groupFitDrag.beginNodeDrag,
    beginGroupFitSelectionDrag: groupFitDrag.beginSelectionDrag,
    finishGroupFitDrag: groupFitDrag.finishDrag,
    beginLinkedCaptureDrag: linkedCaptureDrag.beginLinkedDrag,
    updateLinkedCaptureDrag: linkedCaptureDrag.updateLinkedDrag,
    finishLinkedCaptureDrag: linkedCaptureDrag.finishLinkedDrag,
    beginAltDragCopy: altDragCopy.beginCopyDrag,
    updateAltDragCopy: altDragCopy.updateCopyDrag,
    finishAltDragCopy: altDragCopy.finishCopyDrag,
    clearSnapAlignment,
  });

  return {
    ...graphChanges,
    ...dragLifecycle,
  };
}
