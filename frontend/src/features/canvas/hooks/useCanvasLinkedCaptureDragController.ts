// Copyright (c) 2026 AI anime
import { useCallback, useRef } from 'react';

import { findLinkedCapturePartnerIds } from '../domain/canvasCapturePartners';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';

interface CanvasLinkedCaptureDragState {
  partnerStarts: Map<string, { x: number; y: number }>;
  draggedStart: { x: number; y: number };
}

export interface CanvasLinkedCapturePositionCommit {
  nodeId: string;
  position: { x: number; y: number };
  dragging: true;
}

export interface CanvasLinkedCaptureDragControllerOptions {
  getGraph: () => {
    nodes: readonly CanvasNode[];
    edges: readonly CanvasEdge[];
  };
  commitNodePositions: (
    updates: CanvasLinkedCapturePositionCommit[],
  ) => void;
}

export interface CanvasLinkedCaptureDragController {
  beginLinkedDrag: (
    altKey: boolean,
    draggedNodeId: string,
    draggedNodeCount: number,
  ) => void;
  updateLinkedDrag: (position: { x: number; y: number }) => void;
  finishLinkedDrag: () => void;
}

export function useCanvasLinkedCaptureDragController({
  getGraph,
  commitNodePositions,
}: CanvasLinkedCaptureDragControllerOptions): CanvasLinkedCaptureDragController {
  const linkedDragRef = useRef<CanvasLinkedCaptureDragState | null>(null);

  const beginLinkedDrag = useCallback(
    (altKey: boolean, draggedNodeId: string, draggedNodeCount: number) => {
      linkedDragRef.current = null;
      if (altKey || draggedNodeCount > 1) {
        return;
      }

      const { nodes, edges } = getGraph();
      const partnerIds = findLinkedCapturePartnerIds(
        draggedNodeId,
        nodes,
        edges,
      );
      if (partnerIds.length === 0) {
        return;
      }

      const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
      const draggedNode = nodeById.get(draggedNodeId);
      if (!draggedNode) {
        return;
      }
      const partnerStarts = new Map<string, { x: number; y: number }>();
      for (const partnerId of partnerIds) {
        const partner = nodeById.get(partnerId);
        if (partner && !partner.parentId) {
          partnerStarts.set(partnerId, { ...partner.position });
        }
      }
      if (partnerStarts.size === 0) {
        return;
      }

      linkedDragRef.current = {
        partnerStarts,
        draggedStart: { ...draggedNode.position },
      };
    },
    [getGraph],
  );

  const updateLinkedDrag = useCallback(
    (position: { x: number; y: number }) => {
      const state = linkedDragRef.current;
      if (!state) {
        return;
      }
      const delta = {
        x: position.x - state.draggedStart.x,
        y: position.y - state.draggedStart.y,
      };
      const updates = [...state.partnerStarts].map(([nodeId, start]) => ({
        nodeId,
        position: {
          x: start.x + delta.x,
          y: start.y + delta.y,
        },
        dragging: true as const,
      }));
      if (updates.length > 0) {
        commitNodePositions(updates);
      }
    },
    [commitNodePositions],
  );

  const finishLinkedDrag = useCallback(() => {
    linkedDragRef.current = null;
  }, []);

  return {
    beginLinkedDrag,
    updateLinkedDrag,
    finishLinkedDrag,
  };
}
