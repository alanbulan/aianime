// Copyright (c) 2026 AI anime
import { useCallback, type MouseEvent as ReactMouseEvent } from 'react';

import type { CanvasNode } from '../domain/canvasNodes';

export interface CanvasDragLifecycleControllerOptions {
  beginGroupFitNodeDrag: (
    altKey: boolean,
    nodeId: string,
    draggedNodeIds: readonly string[],
  ) => void;
  beginGroupFitSelectionDrag: (draggedNodeIds: readonly string[]) => void;
  finishGroupFitDrag: () => void;
  beginLinkedCaptureDrag: (
    altKey: boolean,
    nodeId: string,
    draggedNodeCount: number,
  ) => void;
  updateLinkedCaptureDrag: (position: { x: number; y: number }) => void;
  finishLinkedCaptureDrag: () => void;
  beginAltDragCopy: (altKey: boolean, nodeId: string) => void;
  updateAltDragCopy: (
    nodeId: string,
    position: { x: number; y: number },
  ) => void;
  finishAltDragCopy: (
    nodeId: string,
    position: { x: number; y: number },
  ) => void;
  clearSnapAlignment: () => void;
}

export interface CanvasDragLifecycleController {
  handleNodeDragStart: (
    event: ReactMouseEvent,
    node: CanvasNode,
    draggedNodes: CanvasNode[],
  ) => void;
  handleNodeDrag: (event: ReactMouseEvent, node: CanvasNode) => void;
  handleNodeDragStop: (event: ReactMouseEvent, node: CanvasNode) => void;
  handleSelectionDragStart: (
    event: ReactMouseEvent,
    draggedNodes: CanvasNode[],
  ) => void;
  handleSelectionDragStop: () => void;
}

export function useCanvasDragLifecycleController({
  beginGroupFitNodeDrag,
  beginGroupFitSelectionDrag,
  finishGroupFitDrag,
  beginLinkedCaptureDrag,
  updateLinkedCaptureDrag,
  finishLinkedCaptureDrag,
  beginAltDragCopy,
  updateAltDragCopy,
  finishAltDragCopy,
  clearSnapAlignment,
}: CanvasDragLifecycleControllerOptions): CanvasDragLifecycleController {
  const handleNodeDragStart = useCallback(
    (event: ReactMouseEvent, node: CanvasNode, draggedNodes: CanvasNode[]) => {
      beginGroupFitNodeDrag(
        event.altKey,
        node.id,
        draggedNodes?.map((draggedNode) => draggedNode.id) ?? [],
      );
      beginLinkedCaptureDrag(
        event.altKey,
        node.id,
        draggedNodes?.length ?? 0,
      );
      beginAltDragCopy(event.altKey, node.id);
    },
    [beginAltDragCopy, beginGroupFitNodeDrag, beginLinkedCaptureDrag],
  );

  const handleNodeDrag = useCallback(
    (_event: ReactMouseEvent, node: CanvasNode) => {
      updateLinkedCaptureDrag(node.position);
      updateAltDragCopy(node.id, node.position);
    },
    [updateAltDragCopy, updateLinkedCaptureDrag],
  );

  const handleNodeDragStop = useCallback(
    (_event: ReactMouseEvent, node: CanvasNode) => {
      clearSnapAlignment();
      finishLinkedCaptureDrag();
      finishGroupFitDrag();
      finishAltDragCopy(node.id, node.position);
    },
    [
      clearSnapAlignment,
      finishAltDragCopy,
      finishGroupFitDrag,
      finishLinkedCaptureDrag,
    ],
  );

  const handleSelectionDragStart = useCallback(
    (_event: ReactMouseEvent, draggedNodes: CanvasNode[]) => {
      beginGroupFitSelectionDrag(draggedNodes.map((node) => node.id));
    },
    [beginGroupFitSelectionDrag],
  );

  return {
    handleNodeDragStart,
    handleNodeDrag,
    handleNodeDragStop,
    handleSelectionDragStart,
    handleSelectionDragStop: finishGroupFitDrag,
  };
}
