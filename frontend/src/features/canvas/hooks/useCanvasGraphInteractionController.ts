// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';
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
import {
  useCanvasLinkedCaptureDragController,
} from './useCanvasLinkedCaptureDragController';

export interface CanvasGraphInteractionControllerOptions {
  nodes: readonly CanvasNode[];
  selectedNodeIds: readonly string[];
  duplicateNodes: CanvasAltDragCopyControllerOptions['duplicateNodes'];
  elevateNodes: CanvasAltDragCopyControllerOptions['elevateNodes'];
  selectNode: CanvasAltDragCopyControllerOptions['selectNode'];
  getGraph: () => {
    nodes: readonly CanvasNode[];
    edges: readonly CanvasEdge[];
  };
  fitGroupToChildren:
    CanvasGroupFitDragControllerOptions['fitGroupToChildren'];
  alignNodeChanges: CanvasGraphChangeControllerOptions['alignNodeChanges'];
  applyNodeChanges: CanvasGraphChangeControllerOptions['applyNodeChanges'];
  applyEdgeChanges: CanvasGraphChangeControllerOptions['applyEdgeChanges'];
  deleteEdge: CanvasGraphChangeControllerOptions['deleteEdge'];
  clearSnapAlignment: () => void;
}

export interface CanvasGraphInteractionController
  extends CanvasGraphChangeController,
  CanvasDragLifecycleController {}

export function useCanvasGraphInteractionController({
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
}: CanvasGraphInteractionControllerOptions): CanvasGraphInteractionController {
  const commitNodePositions = useCallback(
    (updates: CanvasAltDragPositionCommit[]) => {
      applyNodeChanges(updates.map((update) => ({
        id: update.nodeId,
        type: 'position' as const,
        position: update.position,
        dragging: update.dragging,
      })));
    },
    [applyNodeChanges],
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
  const dragLifecycle = useCanvasDragLifecycleController({
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
