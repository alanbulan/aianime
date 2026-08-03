// Copyright (c) 2026 AI anime
import { useCallback, useRef } from 'react';

import {
  buildSnapAlignIndex,
  computeSnapAlignFromIndex,
  type CanvasSnapNode,
  type SnapAlignGuides,
  type SnapAlignIndex,
} from '@/modules/creative_canvas/domain/canvasSnapAlignment';

export interface CanvasSnapAlignmentNode extends CanvasSnapNode {
  id: string;
}

export interface CanvasPositionChangeLike {
  id?: string;
  type: string;
  position?: { x: number; y: number } | null;
  dragging?: boolean;
}

export interface CanvasSnapAlignmentPort<
  TNode extends CanvasSnapAlignmentNode = CanvasSnapAlignmentNode,
> {
  isEnabled: () => boolean;
  isExcludedNode: (node: TNode) => boolean;
  setGuides: (guides: SnapAlignGuides) => void;
  clearGuides: () => void;
}

export interface AlignCanvasNodeChangesParams<
  TNode extends CanvasSnapAlignmentNode,
  TChange extends CanvasPositionChangeLike,
> {
  nodes: readonly TNode[];
  changes: TChange[];
  copyDragActive: boolean;
}

export interface CanvasSnapAlignmentController<
  TNode extends CanvasSnapAlignmentNode = CanvasSnapAlignmentNode,
> {
  alignNodeChanges: <TChange extends CanvasPositionChangeLike>(
    params: AlignCanvasNodeChangesParams<TNode, TChange>,
  ) => TChange[];
  clearSnapAlignment: () => void;
}

export function useCanvasSnapAlignment<
  TNode extends CanvasSnapAlignmentNode,
>(
  port: CanvasSnapAlignmentPort<TNode>,
): CanvasSnapAlignmentController<TNode> {
  const snapAlignIndexRef = useRef<{
    nodeId: string;
    index: SnapAlignIndex;
  } | null>(null);

  const alignNodeChanges = useCallback(
    <TChange extends CanvasPositionChangeLike>({
      nodes,
      changes,
      copyDragActive,
    }: AlignCanvasNodeChangesParams<TNode, TChange>): TChange[] => {
      if (!port.isEnabled() || copyDragActive) {
        return changes;
      }
      const draggingPositionChanges = changes.filter(
        (change) =>
          change.type === 'position'
          && change.dragging === true
          && Boolean(change.id)
          && Boolean(change.position),
      );
      if (draggingPositionChanges.length > 1) {
        port.clearGuides();
        return changes;
      }
      if (draggingPositionChanges.length === 0) {
        return changes;
      }

      const change = draggingPositionChanges[0];
      const nodeId = change.id as string;
      const position = change.position as { x: number; y: number };
      const draggedNode = nodes.find((node) => node.id === nodeId);
      if (!draggedNode) {
        return changes;
      }
      if (snapAlignIndexRef.current?.nodeId !== nodeId) {
        snapAlignIndexRef.current = {
          nodeId,
          index: buildSnapAlignIndex(
            nodes.filter(
              (node) => node.id !== nodeId && !port.isExcludedNode(node),
            ),
          ),
        };
      }
      const snap = computeSnapAlignFromIndex(
        draggedNode,
        position,
        snapAlignIndexRef.current.index,
      );
      port.setGuides(snap.guides);
      return changes.map((candidate): TChange =>
        candidate === change
          ? { ...change, position: snap.position } as TChange
          : candidate,
      );
    },
    [port],
  );

  const clearSnapAlignment = useCallback(() => {
    port.clearGuides();
    snapAlignIndexRef.current = null;
  }, [port]);

  return {
    alignNodeChanges,
    clearSnapAlignment,
  };
}
