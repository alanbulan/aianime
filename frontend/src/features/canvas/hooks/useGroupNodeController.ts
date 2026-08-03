// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

import { useCanvasStore } from '@/features/canvas/canvasStore';
import { uploadCanvasAsset } from '@/features/canvas/composition';
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type GroupNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import {
  STORYBOARD_CELL_GAP,
  STORYBOARD_HEADER_PADDING,
  STORYBOARD_PADDING,
  computeStoryboardBoardLayout,
  resolveStoryboardCols,
  storyboardSlotRect,
} from '@/features/canvas/domain/storyboardGroup';
import { getStoryboardCellPreview } from '@/features/canvas/domain/storyboardCellPreview';
import { computeSnapAlign } from '@/features/canvas/snap-align/computeSnapAlign';
import { useSnapAlignStore } from '@/features/canvas/snap-align/snapAlignStore';
import {
  useCanvasProjectionStatus,
  type CanvasAsset,
} from '@/modules/creative_canvas/public';

interface Point {
  x: number;
  y: number;
}

interface DragState {
  from: number;
  start: Point;
  cur: Point;
}

export interface GroupNodeControllerOptions {
  id: string;
  data: GroupNodeData;
  projectId: string;
  selected?: boolean;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function useGroupNodeController({
  id,
  data,
  projectId,
  selected,
}: GroupNodeControllerOptions) {
  const { t } = useTranslation();
  const reactFlow = useReactFlow();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const fitGroupToChildren = useCanvasStore((state) => state.fitGroupToChildren);
  const reorderStoryboardMember = useCanvasStore(
    (state) => state.reorderStoryboardMember,
  );
  const addStoryboardMembers = useCanvasStore(
    (state) => state.addStoryboardMembers,
  );
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const isInteracting = useCanvasStore(
    (state) => state.dragHistorySnapshot !== null,
  );
  const isStoryboard = data.storyboardGroup === true;
  const showIndex = isStoryboard && data.storyboardShowIndex === true;

  const groupScopedNodes = useCanvasStore(
    useShallow((state) =>
      state.nodes.filter((node) => node.id === id || node.parentId === id),
    ),
  );
  const childCount = groupScopedNodes.reduce(
    (count, node) => (node.parentId === id ? count + 1 : count),
    0,
  );

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addMenuAnchor, setAddMenuAnchor] = useState<{
    cx: number;
    cy: number;
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);

  const uploadLocalFiles = useCallback(
    async (files: FileList | null) => {
      setAddMenuOpen(false);
      if (!files || files.length === 0) {
        return;
      }
      const imageFiles = Array.from(files).filter((file) =>
        file.type.startsWith('image/'),
      );
      if (imageFiles.length === 0) {
        toast(t('canvas.storyboardGroup.imageOnlyHint'));
        return;
      }
      setUploading(true);
      try {
        const uploaded = await Promise.all(
          imageFiles.map(async (file) => {
            const result = await uploadCanvasAsset(projectId, file, file.name);
            return {
              imageUrl: result.url,
              previewImageUrl: result.url,
              displayName: file.name,
            };
          }),
        );
        addStoryboardMembers(id, uploaded);
      } catch (error) {
        console.error('[storyboard] upload failed', error);
        toast(t('canvas.storyboardGroup.uploadFailed'));
      } finally {
        setUploading(false);
      }
    },
    [addStoryboardMembers, id, projectId, t],
  );

  const pickHistoryAsset = useCallback(
    (asset: CanvasAsset) => {
      setHistoryOpen(false);
      addStoryboardMembers(id, [
        {
          imageUrl: asset.url,
          previewImageUrl: asset.previewUrl ?? asset.url,
          displayName: asset.label ?? undefined,
        },
      ]);
    },
    [addStoryboardMembers, id],
  );

  useEffect(() => {
    if (!addMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (addMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setAddMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [addMenuOpen]);

  const snapEnabled = useSnapAlignStore((state) => state.enabled);
  const setSnapGuides = useSnapAlignStore((state) => state.setGuides);
  const clearSnapGuides = useSnapAlignStore((state) => state.clearGuides);
  const groupPosition = useMemo(() => {
    const self = groupScopedNodes.find((node) => node.id === id);
    return self?.position ?? { x: 0, y: 0 };
  }, [groupScopedNodes, id]);

  const board = useMemo(() => {
    if (!isStoryboard) {
      return null;
    }
    const members = groupScopedNodes
      .filter((node) => node.parentId === id)
      .sort(
        (left, right) =>
          left.position.y - right.position.y ||
          left.position.x - right.position.x,
      );
    const layout = computeStoryboardBoardLayout({
      count: members.length,
      cols: resolveStoryboardCols(members.length, data.storyboardCols),
      aspectKey: data.storyboardAspect,
    });
    return {
      previews: members.map((node) => getStoryboardCellPreview(node)),
      cols: layout.cols,
      rows: layout.rows,
      cellWidth: layout.cellWidth,
      cellHeight: layout.cellHeight,
    };
  }, [
    data.storyboardAspect,
    data.storyboardCols,
    groupScopedNodes,
    id,
    isStoryboard,
  ]);
  const count = board?.previews.length ?? 0;

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const resolveOverIndex = useCallback(
    (state: DragState): number => {
      if (!board || count === 0) {
        return 0;
      }
      const zoom = reactFlow.getViewport().zoom || 1;
      const dx = (state.cur.x - state.start.x) / zoom;
      const dy = (state.cur.y - state.start.y) / zoom;
      const fromRect = storyboardSlotRect(
        state.from,
        board.cols,
        board.cellWidth,
        board.cellHeight,
      );
      const centerX = fromRect.x + dx + board.cellWidth / 2;
      const centerY = fromRect.y + dy + board.cellHeight / 2;
      const col = clamp(
        Math.round(
          (centerX - STORYBOARD_PADDING) /
            (board.cellWidth + STORYBOARD_CELL_GAP),
        ),
        0,
        board.cols - 1,
      );
      const row = clamp(
        Math.round(
          (centerY - STORYBOARD_HEADER_PADDING) /
            (board.cellHeight + STORYBOARD_CELL_GAP),
        ),
        0,
        board.rows - 1,
      );
      return clamp(row * board.cols + col, 0, count - 1);
    },
    [board, count, reactFlow],
  );

  const isDragging = drag !== null;
  useEffect(() => {
    if (!isDragging) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      setDrag((previous) =>
        previous
          ? { ...previous, cur: { x: event.clientX, y: event.clientY } }
          : previous,
      );
    };
    const onUp = () => {
      const state = dragRef.current;
      if (state) {
        const over = resolveOverIndex(state);
        if (over !== state.from) {
          reorderStoryboardMember(id, state.from, over);
        }
      }
      clearSnapGuides();
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, [
    clearSnapGuides,
    id,
    isDragging,
    reorderStoryboardMember,
    resolveOverIndex,
  ]);

  const overIndex = drag ? resolveOverIndex(drag) : null;
  const slotOf = useMemo(() => {
    const order = Array.from({ length: count }, (_, index) => index);
    if (drag && overIndex !== null) {
      order.splice(drag.from, 1);
      order.splice(overIndex, 0, drag.from);
    }
    const slots = new Map<number, number>();
    order.forEach((original, slot) => slots.set(original, slot));
    return slots;
  }, [count, drag, overIndex]);

  const floating = useMemo(() => {
    if (!drag || !board) {
      return null;
    }
    const zoom = reactFlow.getViewport().zoom || 1;
    const fromRect = storyboardSlotRect(
      drag.from,
      board.cols,
      board.cellWidth,
      board.cellHeight,
    );
    const rawLeft = fromRect.x + (drag.cur.x - drag.start.x) / zoom;
    const rawTop = fromRect.y + (drag.cur.y - drag.start.y) / zoom;
    let left = rawLeft;
    let top = rawTop;
    let guides = { vertical: [] as number[], horizontal: [] as number[] };

    if (snapEnabled) {
      const draggedFlow = {
        x: groupPosition.x + rawLeft,
        y: groupPosition.y + rawTop,
      };
      const pseudo = {
        position: draggedFlow,
        width: board.cellWidth,
        height: board.cellHeight,
      } as unknown as CanvasNode;
      const others: CanvasNode[] = [];
      for (let index = 0; index < count; index += 1) {
        if (index === drag.from) {
          continue;
        }
        const slot = slotOf.get(index) ?? index;
        const rect = storyboardSlotRect(
          slot,
          board.cols,
          board.cellWidth,
          board.cellHeight,
        );
        others.push({
          position: {
            x: groupPosition.x + rect.x,
            y: groupPosition.y + rect.y,
          },
          width: board.cellWidth,
          height: board.cellHeight,
        } as unknown as CanvasNode);
      }
      const snap = computeSnapAlign(pseudo, draggedFlow, others);
      left = snap.position.x - groupPosition.x;
      top = snap.position.y - groupPosition.y;
      guides = snap.guides;
    }

    return {
      left,
      top,
      width: board.cellWidth,
      height: board.cellHeight,
      preview: board.previews[drag.from],
      guides,
    };
  }, [
    board,
    count,
    drag,
    groupPosition,
    reactFlow,
    slotOf,
    snapEnabled,
  ]);

  useEffect(() => {
    if (!isDragging || !snapEnabled || !floating) {
      return;
    }
    setSnapGuides(floating.guides);
  }, [floating, isDragging, setSnapGuides, snapEnabled]);

  const storyboardCells = useMemo(() => {
    if (!board) {
      return [];
    }
    return board.previews.flatMap((preview, index) => {
      if (drag?.from === index) {
        return [];
      }
      const slot = slotOf.get(index) ?? index;
      return [
        {
          index,
          slot,
          preview,
          rect: storyboardSlotRect(
            slot,
            board.cols,
            board.cellWidth,
            board.cellHeight,
          ),
        },
      ];
    });
  }, [board, drag?.from, slotOf]);

  const emptyCells = useMemo(() => {
    if (!board) {
      return [];
    }
    const rects = [];
    for (let index = count; index < board.cols * board.rows; index += 1) {
      rects.push(
        storyboardSlotRect(
          index,
          board.cols,
          board.cellWidth,
          board.cellHeight,
        ),
      );
    }
    return rects;
  }, [board, count]);

  const childGeometrySignature = useMemo(
    () =>
      isStoryboard
        ? ''
        : groupScopedNodes
            .filter((node) => node.parentId === id)
            .map(
              (node) =>
                `${node.id}:${Math.round(node.position.x)},${Math.round(
                  node.position.y,
                )},${Math.round(
                  node.measured?.width ??
                    (typeof node.width === 'number' ? node.width : 0),
                )},${Math.round(
                  node.measured?.height ??
                    (typeof node.height === 'number' ? node.height : 0),
                )}`,
            )
            .join('|'),
    [groupScopedNodes, id, isStoryboard],
  );

  useEffect(() => {
    if (isStoryboard || isInteracting) {
      return;
    }
    fitGroupToChildren(id);
  }, [
    childGeometrySignature,
    fitGroupToChildren,
    id,
    isInteracting,
    isStoryboard,
  ]);

  const resolvedTitle = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.group, data),
    [data],
  );
  const headerTitle = isStoryboard
    ? t('canvas.storyboardGroup.headerCount', { count: childCount })
    : resolvedTitle;
  const projectionKey =
    data.user_spawned !== true &&
    typeof data.projection_key === 'string' &&
    data.projection_key.trim()
      ? data.projection_key.trim()
      : null;
  const projectionStatus = useCanvasProjectionStatus(projectionKey);
  const projectionIsStale = projectionStatus?.stale === true;

  return {
    id,
    projectId,
    data,
    selected,
    isStoryboard,
    showIndex,
    headerTitle,
    projectionIsStale,
    uploading,
    addMenuOpen,
    addMenuAnchor,
    historyOpen,
    fileInputRef,
    addMenuRef,
    isDragging,
    storyboardCells,
    emptyCells,
    floating,
    rename: (nextTitle: string) =>
      updateNodeData(id, {
        displayName: nextTitle,
        label: nextTitle,
      }),
    openAddMenu: (anchor: { cx: number; cy: number }) => {
      setAddMenuAnchor(anchor);
      setAddMenuOpen(true);
    },
    requestLocalUpload: () => {
      setAddMenuOpen(false);
      fileInputRef.current?.click();
    },
    openHistory: () => {
      setAddMenuOpen(false);
      setHistoryOpen(true);
    },
    closeHistory: () => setHistoryOpen(false),
    uploadLocalFiles,
    pickHistoryAsset,
    deleteHistoryNode: deleteNode,
    startStoryboardDrag: (from: number, start: Point) => {
      setDrag({ from, start, cur: start });
    },
  };
}

export type GroupNodeController = ReturnType<typeof useGroupNodeController>;
