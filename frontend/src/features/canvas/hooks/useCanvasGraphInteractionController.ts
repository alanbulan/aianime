// Copyright (c) 2026 AI anime
import { useCallback } from 'react';
import type { EdgeChange, NodeChange } from '@xyflow/react';

import {
  useCanvasAltDragCopyController,
  type CanvasAltDragCopyControllerOptions,
  type CanvasAltDragPositionCommit,
  useCanvasDragLifecycleController,
  type CanvasDragLifecycleController,
  useCanvasGraphChangeController,
  type CanvasGraphChangeController,
  type CanvasGraphChangeControllerOptions,
  useCanvasGroupFitDragController,
  type CanvasGroupFitDragControllerOptions,
  useCanvasLinkedCaptureDragController,
} from '@/modules/creative_canvas/public';
import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeType,
} from '../domain/canvasNodes';

type AltDragCopyOptions = CanvasAltDragCopyControllerOptions<CanvasNode>;
type GroupFitDragOptions = CanvasGroupFitDragControllerOptions<CanvasNode>;
type GraphChangeOptions = CanvasGraphChangeControllerOptions<
  CanvasNode,
  CanvasEdge,
  NodeChange<CanvasNode>,
  EdgeChange<CanvasEdge>
>;

export interface CanvasGraphInteractionControllerOptions {
  nodes: readonly CanvasNode[];
  selectedNodeIds: readonly string[];
  duplicateNodes: AltDragCopyOptions['duplicateNodes'];
  elevateNodes: AltDragCopyOptions['elevateNodes'];
  selectNode: AltDragCopyOptions['selectNode'];
  getGraph: () => {
    nodes: readonly CanvasNode[];
    edges: readonly CanvasEdge[];
  };
  fitGroupToChildren:
    GroupFitDragOptions['fitGroupToChildren'];
  alignNodeChanges: GraphChangeOptions['alignNodeChanges'];
  applyNodeChanges: GraphChangeOptions['applyNodeChanges'];
  applyEdgeChanges: GraphChangeOptions['applyEdgeChanges'];
  deleteEdge: GraphChangeOptions['deleteEdge'];
  clearSnapAlignment: () => void;
}

export interface CanvasGraphInteractionController
  extends CanvasGraphChangeController<
    CanvasEdge,
    NodeChange<CanvasNode>,
    EdgeChange<CanvasEdge>
  >,
  CanvasDragLifecycleController<CanvasNode> {}

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
  const linkedCaptureDrag = useCanvasLinkedCaptureDragController<
    CanvasNode,
    CanvasEdge,
    CanvasNodeType
  >({
    getGraph,
    groupNodeType: CANVAS_NODE_TYPES.group,
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
