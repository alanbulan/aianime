// Copyright (c) 2026 AI anime
import { memo, useCallback, useMemo, useRef } from 'react';
import { NodeToolbar as ReactFlowNodeToolbar, Position } from '@xyflow/react';
import { Plus } from 'lucide-react';

import { useCanvasStore } from '@/features/canvas/canvasStore';
import { resolveCanvasBatchConnectContext } from '@/modules/creative_canvas/public';

const DRAG_THRESHOLD_PX = 5;

export interface BatchConnectParams {
  clientPosition: { x: number; y: number };
}

interface MultiSelectionConnectButtonProps {
  onBatchOpenMenu: (params: BatchConnectParams) => void;
  onBatchDragStart: (params: BatchConnectParams) => void;
  onBatchDragMove: (params: BatchConnectParams) => void;
  onBatchDragEnd: (params: BatchConnectParams) => void;
}

/**
 * Batch-connect affordance for a multi-selection: a single "+" anchored to the
 * right edge of the selection box. It is the multi-node generalization of
 * {@link NodeSpawnPlusOverlay}'s right-side "+":
 * - **click** → opens the node menu to spawn one downstream node that every
 *   selected source node fans into.
 * - **drag** → draws a connection line; drop it on an existing node to fan all
 *   selected nodes into it, or drop on empty canvas to open the spawn menu there.
 *
 * Only shown when ≥2 selected nodes have a source handle AND share at least one
 * valid downstream node type (so the spawned/target node can accept all of them).
 */
export const MultiSelectionConnectButton = memo(
  ({
    onBatchOpenMenu,
    onBatchDragStart,
    onBatchDragMove,
    onBatchDragEnd,
  }: MultiSelectionConnectButtonProps) => {
    const nodes = useCanvasStore((state) => state.nodes);

    // Anchor to the full selection box (all selected nodes) so the "+" sits on
    // its right edge, matching the dashed frame / top toolbar.
    const selectedIds = useMemo(
      () => nodes.filter((node) => Boolean(node.selected)).map((node) => node.id),
      [nodes],
    );

    const batchConnectContext = useMemo(
      () => resolveCanvasBatchConnectContext(nodes),
      [nodes],
    );

    const dragStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
    const draggedRef = useRef(false);
    const suppressClickRef = useRef(false);

    const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        dragStartRef.current = {
          x: event.clientX,
          y: event.clientY,
          pointerId: event.pointerId,
        };
        draggedRef.current = false;

        const handleMove = (moveEvent: PointerEvent) => {
          const start = dragStartRef.current;
          if (!start || start.pointerId !== moveEvent.pointerId) {
            return;
          }
          const clientPosition = { x: moveEvent.clientX, y: moveEvent.clientY };
          if (!draggedRef.current) {
            const delta = Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y);
            if (delta < DRAG_THRESHOLD_PX) {
              return;
            }
            draggedRef.current = true;
            suppressClickRef.current = true;
            onBatchDragStart({ clientPosition: { x: start.x, y: start.y } });
          }
          onBatchDragMove({ clientPosition });
        };

        const handleUp = (upEvent: PointerEvent) => {
          const wasDragging = draggedRef.current;
          if (dragStartRef.current?.pointerId === upEvent.pointerId) {
            dragStartRef.current = null;
          }
          window.removeEventListener('pointermove', handleMove, true);
          window.removeEventListener('pointerup', handleUp, true);
          window.removeEventListener('pointercancel', handleUp, true);
          if (wasDragging) {
            onBatchDragEnd({
              clientPosition: { x: upEvent.clientX, y: upEvent.clientY },
            });
          }
        };

        window.addEventListener('pointermove', handleMove, true);
        window.addEventListener('pointerup', handleUp, true);
        window.addEventListener('pointercancel', handleUp, true);
      },
      [onBatchDragEnd, onBatchDragMove, onBatchDragStart],
    );

    if (!batchConnectContext) {
      return null;
    }

    return (
      <ReactFlowNodeToolbar
        nodeId={selectedIds}
        isVisible
        position={Position.Right}
        align="center"
        offset={20}
        className="pointer-events-auto"
      >
        <button
          type="button"
          aria-label="批量连线"
          title="批量连线：点击新建下游节点并把选中节点都连进去，或拖动连到已有节点"
          className="nodrag flex h-8 w-8 items-center justify-center rounded-full border border-border bg-popover/95 text-popover-foreground/85 shadow-lg transition-[border-color,color,box-shadow] duration-150 hover:border-primary/60 hover:text-popover-foreground hover:shadow-[var(--ui-glow-accent)]"
          onPointerDown={handlePointerDown}
          onClick={(event) => {
            event.stopPropagation();
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            onBatchOpenMenu({
              clientPosition: { x: event.clientX, y: event.clientY },
            });
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
      </ReactFlowNodeToolbar>
    );
  },
);

MultiSelectionConnectButton.displayName = 'MultiSelectionConnectButton';
