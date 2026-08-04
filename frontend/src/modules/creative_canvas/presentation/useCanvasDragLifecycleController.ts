// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

export interface CanvasDragLifecycleNode {
  id: string;
  position: { x: number; y: number };
}

export interface CanvasDragStartEvent {
  altKey: boolean;
}

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

export interface CanvasDragLifecycleController<
  TNode extends CanvasDragLifecycleNode,
> {
  handleNodeDragStart: (
    event: CanvasDragStartEvent,
    node: TNode,
    draggedNodes: TNode[],
  ) => void;
  handleNodeDrag: (event: unknown, node: TNode) => void;
  handleNodeDragStop: (event: unknown, node: TNode) => void;
  handleSelectionDragStart: (event: unknown, draggedNodes: TNode[]) => void;
  handleSelectionDragStop: () => void;
}

export function useCanvasDragLifecycleController<
  TNode extends CanvasDragLifecycleNode,
>({
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
}: CanvasDragLifecycleControllerOptions): CanvasDragLifecycleController<TNode> {
  const handleNodeDragStart = useCallback(
    (event: CanvasDragStartEvent, node: TNode, draggedNodes: TNode[]) => {
      beginGroupFitNodeDrag(
        event.altKey,
        node.id,
        draggedNodes.map((draggedNode) => draggedNode.id),
      );
      beginLinkedCaptureDrag(event.altKey, node.id, draggedNodes.length);
      beginAltDragCopy(event.altKey, node.id);
    },
    [beginAltDragCopy, beginGroupFitNodeDrag, beginLinkedCaptureDrag],
  );

  const handleNodeDrag = useCallback(
    (_event: unknown, node: TNode) => {
      updateLinkedCaptureDrag(node.position);
      updateAltDragCopy(node.id, node.position);
    },
    [updateAltDragCopy, updateLinkedCaptureDrag],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, node: TNode) => {
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
    (_event: unknown, draggedNodes: TNode[]) => {
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
