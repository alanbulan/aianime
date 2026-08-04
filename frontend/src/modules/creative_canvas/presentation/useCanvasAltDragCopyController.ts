// Copyright (c) 2026 AI anime
import { useCallback, useRef } from 'react';

const ALT_DRAG_COPY_Z_INDEX = 2000;

export interface CanvasAltDragNode {
  id: string;
  position: { x: number; y: number };
}

interface CanvasAltDragCopyState {
  sourceNodeIds: string[];
  startPositions: Map<string, { x: number; y: number }>;
  copiedNodeIds: string[];
  sourceToCopyIdMap: ReadonlyMap<string, string>;
}

export interface CanvasAltDragPositionCommit {
  nodeId: string;
  position: { x: number; y: number };
  dragging: boolean;
}

export interface CanvasAltDragCopyControllerOptions<
  TNode extends CanvasAltDragNode,
> {
  nodes: readonly TNode[];
  selectedNodeIds: readonly string[];
  duplicateNodes: (
    sourceNodeIds: string[],
    options: {
      explicitOffset: { x: number; y: number };
      disableOffsetIteration: true;
      suppressSelect: true;
    },
  ) => { idMap: ReadonlyMap<string, string> } | null;
  elevateNodes: (nodeIds: string[], zIndex: number) => void;
  commitNodePositions: (updates: CanvasAltDragPositionCommit[]) => void;
  selectNode: (nodeId: string) => void;
}

export interface CanvasAltDragCopyController {
  beginCopyDrag: (altKey: boolean, draggedNodeId: string) => void;
  updateCopyDrag: (
    draggedNodeId: string,
    position: { x: number; y: number },
  ) => void;
  finishCopyDrag: (
    draggedNodeId: string,
    position: { x: number; y: number },
  ) => void;
  isCopyDragActive: () => boolean;
}

function createPositionCommits(
  state: CanvasAltDragCopyState,
  draggedNodeId: string,
  position: { x: number; y: number },
  dragging: boolean,
): CanvasAltDragPositionCommit[] | null {
  const draggedStart = state.startPositions.get(draggedNodeId);
  if (!draggedStart) {
    return null;
  }

  const delta = {
    x: position.x - draggedStart.x,
    y: position.y - draggedStart.y,
  };
  const sourceUpdates: CanvasAltDragPositionCommit[] = [];
  const copyUpdates: CanvasAltDragPositionCommit[] = [];
  for (const sourceNodeId of state.sourceNodeIds) {
    const sourceStart = state.startPositions.get(sourceNodeId);
    if (!sourceStart) {
      continue;
    }
    sourceUpdates.push({
      nodeId: sourceNodeId,
      position: sourceStart,
      dragging,
    });

    const copyId = state.sourceToCopyIdMap.get(sourceNodeId);
    if (copyId) {
      copyUpdates.push({
        nodeId: copyId,
        position: {
          x: sourceStart.x + delta.x,
          y: sourceStart.y + delta.y,
        },
        dragging,
      });
    }
  }
  return [...sourceUpdates, ...copyUpdates];
}

export function useCanvasAltDragCopyController<
  TNode extends CanvasAltDragNode,
>({
  nodes,
  selectedNodeIds,
  duplicateNodes,
  elevateNodes,
  commitNodePositions,
  selectNode,
}: CanvasAltDragCopyControllerOptions<TNode>): CanvasAltDragCopyController {
  const copyStateRef = useRef<CanvasAltDragCopyState | null>(null);

  const beginCopyDrag = useCallback(
    (altKey: boolean, draggedNodeId: string) => {
      copyStateRef.current = null;
      if (!altKey) {
        return;
      }

      const sourceNodeIds = selectedNodeIds.includes(draggedNodeId)
        ? [...selectedNodeIds]
        : [draggedNodeId];
      if (sourceNodeIds.length === 0) {
        return;
      }

      const startPositions = new Map<string, { x: number; y: number }>();
      for (const sourceNodeId of sourceNodeIds) {
        const sourceNode = nodes.find((node) => node.id === sourceNodeId);
        if (sourceNode) {
          startPositions.set(sourceNodeId, { ...sourceNode.position });
        }
      }
      if (startPositions.size === 0) {
        return;
      }

      const duplication = duplicateNodes(sourceNodeIds, {
        explicitOffset: { x: 0, y: 0 },
        disableOffsetIteration: true,
        suppressSelect: true,
      });
      if (!duplication) {
        return;
      }

      const copiedNodeIds = sourceNodeIds
        .map((sourceNodeId) => duplication.idMap.get(sourceNodeId))
        .filter((nodeId): nodeId is string => Boolean(nodeId));
      if (copiedNodeIds.length === 0) {
        return;
      }

      elevateNodes(copiedNodeIds, ALT_DRAG_COPY_Z_INDEX);
      copyStateRef.current = {
        sourceNodeIds,
        startPositions,
        copiedNodeIds,
        sourceToCopyIdMap: duplication.idMap,
      };
    },
    [duplicateNodes, elevateNodes, nodes, selectedNodeIds],
  );

  const updateCopyDrag = useCallback(
    (draggedNodeId: string, position: { x: number; y: number }) => {
      const state = copyStateRef.current;
      if (!state) {
        return;
      }
      const updates = createPositionCommits(
        state,
        draggedNodeId,
        position,
        true,
      );
      if (updates && updates.length > 0) {
        commitNodePositions(updates);
      }
    },
    [commitNodePositions],
  );

  const finishCopyDrag = useCallback(
    (draggedNodeId: string, position: { x: number; y: number }) => {
      const state = copyStateRef.current;
      if (!state) {
        return;
      }
      copyStateRef.current = null;
      const updates = createPositionCommits(
        state,
        draggedNodeId,
        position,
        false,
      );
      if (!updates) {
        return;
      }
      if (updates.length > 0) {
        commitNodePositions(updates);
      }
      selectNode(state.copiedNodeIds[0]);
    },
    [commitNodePositions, selectNode],
  );

  const isCopyDragActive = useCallback(
    () => copyStateRef.current !== null,
    [],
  );

  return {
    beginCopyDrag,
    updateCopyDrag,
    finishCopyDrag,
    isCopyDragActive,
  };
}
