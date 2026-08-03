// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CanvasAsset } from '@/modules/creative_canvas/domain/canvasAsset';
import type { StoryboardCellPreview } from '@/modules/creative_canvas/domain/storyboardCellPreview';
import {
  STORYBOARD_CELL_GAP,
  STORYBOARD_HEADER_PADDING,
  STORYBOARD_PADDING,
  computeStoryboardBoardLayout,
  resolveStoryboardCols,
  storyboardSlotRect,
} from '@/modules/creative_canvas/domain/storyboardGroup';
import { useCanvasProjectionStatus } from '@/modules/creative_canvas/presentation/useCanvasProjectionStatus';

export interface GroupNodePoint {
  x: number;
  y: number;
}

interface DragState {
  from: number;
  start: GroupNodePoint;
  cur: GroupNodePoint;
}

export interface GroupNodePresentationData {
  label?: string;
  displayName?: string;
  backgroundColor?: string | null;
  storyboardGroup?: boolean;
  storyboardAspect?: string;
  storyboardCols?: number;
  storyboardShowIndex?: boolean;
  user_spawned?: boolean;
  projection_key?: string;
  [key: string]: unknown;
}

export interface GroupNodeSnapNode {
  position: GroupNodePoint;
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
}

export interface GroupNodeScopedNode extends GroupNodeSnapNode {
  id: string;
  parentId?: string;
  type?: string;
  data?: unknown;
}

export interface GroupNodeSnapGuides {
  vertical: number[];
  horizontal: number[];
}

export interface GroupNodeControllerPorts {
  translate: (key: string, options?: Record<string, unknown>) => string;
  uploadAsset: (
    projectId: string,
    file: File,
    displayName: string,
  ) => Promise<{ url: string }>;
  notify: (message: string) => void;
  reportUploadError: (error: unknown) => void;
  updateNodeData: (
    nodeId: string,
    patch: Record<string, unknown>,
  ) => void;
  fitGroupToChildren: (groupNodeId: string) => void;
  reorderStoryboardMember: (
    groupNodeId: string,
    fromIndex: number,
    toIndex: number,
  ) => void;
  addStoryboardMembers: (
    groupNodeId: string,
    members: Array<{
      imageUrl: string;
      previewImageUrl: string;
      displayName?: string;
    }>,
  ) => void;
  deleteNode: (nodeId: string) => unknown;
  resolveGroupTitle: (data: GroupNodePresentationData) => string;
  resolveStoryboardCellPreview: (
    node: GroupNodeScopedNode,
  ) => StoryboardCellPreview;
  computeSnapAlign: (
    draggedNode: GroupNodeSnapNode,
    proposedPosition: GroupNodePoint,
    otherNodes: GroupNodeSnapNode[],
  ) => { position: GroupNodePoint; guides: GroupNodeSnapGuides };
  getViewportZoom: () => number;
  setSnapGuides: (guides: GroupNodeSnapGuides) => void;
  clearSnapGuides: () => void;
}

export interface GroupNodeControllerOptions {
  id: string;
  data: GroupNodePresentationData;
  projectId: string;
  selected?: boolean;
  groupScopedNodes: GroupNodeScopedNode[];
  isInteracting: boolean;
  snapEnabled: boolean;
  ports: GroupNodeControllerPorts;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function useGroupNodeController({
  id,
  data,
  projectId,
  selected,
  groupScopedNodes,
  isInteracting,
  snapEnabled,
  ports,
}: GroupNodeControllerOptions) {
  const isStoryboard = data.storyboardGroup === true;
  const showIndex = isStoryboard && data.storyboardShowIndex === true;
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
        ports.notify(ports.translate('canvas.storyboardGroup.imageOnlyHint'));
        return;
      }
      setUploading(true);
      try {
        const uploaded = await Promise.all(
          imageFiles.map(async (file) => {
            const result = await ports.uploadAsset(projectId, file, file.name);
            return {
              imageUrl: result.url,
              previewImageUrl: result.url,
              displayName: file.name,
            };
          }),
        );
        ports.addStoryboardMembers(id, uploaded);
      } catch (error) {
        ports.reportUploadError(error);
        ports.notify(ports.translate('canvas.storyboardGroup.uploadFailed'));
      } finally {
        setUploading(false);
      }
    },
    [id, ports, projectId],
  );

  const pickHistoryAsset = useCallback(
    (asset: CanvasAsset) => {
      setHistoryOpen(false);
      ports.addStoryboardMembers(id, [
        {
          imageUrl: asset.url,
          previewImageUrl: asset.previewUrl ?? asset.url,
          displayName: asset.label ?? undefined,
        },
      ]);
    },
    [id, ports],
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
      previews: members.map((node) =>
        ports.resolveStoryboardCellPreview(node),
      ),
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
    ports,
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
      const zoom = ports.getViewportZoom() || 1;
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
    [board, count, ports],
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
          ports.reorderStoryboardMember(id, state.from, over);
        }
      }
      ports.clearSnapGuides();
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
    id,
    isDragging,
    ports,
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
    const zoom = ports.getViewportZoom() || 1;
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
      } satisfies GroupNodeSnapNode;
      const others: GroupNodeSnapNode[] = [];
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
        });
      }
      const snap = ports.computeSnapAlign(pseudo, draggedFlow, others);
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
    ports,
    slotOf,
    snapEnabled,
  ]);

  useEffect(() => {
    if (!isDragging || !snapEnabled || !floating) {
      return;
    }
    ports.setSnapGuides(floating.guides);
  }, [floating, isDragging, ports, snapEnabled]);

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
    ports.fitGroupToChildren(id);
  }, [
    childGeometrySignature,
    id,
    isInteracting,
    isStoryboard,
    ports,
  ]);

  const resolvedTitle = useMemo(
    () => ports.resolveGroupTitle(data),
    [data, ports],
  );
  const headerTitle = isStoryboard
    ? ports.translate('canvas.storyboardGroup.headerCount', {
        count: childCount,
      })
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
    t: ports.translate,
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
      ports.updateNodeData(id, {
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
    deleteHistoryNode: ports.deleteNode,
    startStoryboardDrag: (from: number, start: GroupNodePoint) => {
      setDrag({ from, start, cur: start });
    },
  };
}

export type GroupNodeController = ReturnType<typeof useGroupNodeController>;
