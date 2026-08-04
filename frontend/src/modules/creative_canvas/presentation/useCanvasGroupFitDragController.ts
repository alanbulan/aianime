// Copyright (c) 2026 AI anime
import { useCallback, useRef } from 'react';

export interface CanvasGroupFitDragNode {
  id: string;
  parentId?: string;
}

export interface CanvasGroupFitDragControllerOptions<
  TNode extends CanvasGroupFitDragNode,
> {
  getGraph: () => { nodes: readonly TNode[] };
  fitGroupToChildren: (groupNodeId: string) => void;
}

export interface CanvasGroupFitDragController {
  beginNodeDrag: (
    altKey: boolean,
    draggedNodeId: string,
    draggedNodeIds: readonly string[],
  ) => void;
  beginSelectionDrag: (draggedNodeIds: readonly string[]) => void;
  finishDrag: () => void;
}

function resolveParentGroupIds<TNode extends CanvasGroupFitDragNode>(
  nodes: readonly TNode[],
  draggedNodeIds: readonly string[],
): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const groupIds = new Set<string>();
  for (const nodeId of draggedNodeIds) {
    const parentId = nodeById.get(nodeId)?.parentId;
    if (parentId) {
      groupIds.add(parentId);
    }
  }
  return [...groupIds];
}

export function useCanvasGroupFitDragController<
  TNode extends CanvasGroupFitDragNode,
>({
  getGraph,
  fitGroupToChildren,
}: CanvasGroupFitDragControllerOptions<TNode>): CanvasGroupFitDragController {
  const pendingGroupIdsRef = useRef<string[]>([]);

  const beginNodeDrag = useCallback(
    (
      altKey: boolean,
      draggedNodeId: string,
      draggedNodeIds: readonly string[],
    ) => {
      pendingGroupIdsRef.current = [];
      if (altKey) {
        return;
      }
      pendingGroupIdsRef.current = resolveParentGroupIds(
        getGraph().nodes,
        draggedNodeIds.length > 0 ? draggedNodeIds : [draggedNodeId],
      );
    },
    [getGraph],
  );

  const beginSelectionDrag = useCallback(
    (draggedNodeIds: readonly string[]) => {
      pendingGroupIdsRef.current = resolveParentGroupIds(
        getGraph().nodes,
        draggedNodeIds,
      );
    },
    [getGraph],
  );

  const finishDrag = useCallback(() => {
    const groupIds = pendingGroupIdsRef.current;
    pendingGroupIdsRef.current = [];
    for (const groupId of groupIds) {
      fitGroupToChildren(groupId);
    }
  }, [fitGroupToChildren]);

  return {
    beginNodeDrag,
    beginSelectionDrag,
    finishDrag,
  };
}
