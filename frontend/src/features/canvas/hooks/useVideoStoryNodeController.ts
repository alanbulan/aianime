// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';

import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  CANVAS_NODE_TYPES,
  type VideoStoryNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import type { VideoStoryRow } from '@/modules/creative_canvas/public';

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 360;
const MIN_WIDTH = 480;
const MIN_HEIGHT = 240;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1200;

export interface VideoStoryNodeControllerOptions {
  id: string;
  data: VideoStoryNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
}

export function useVideoStoryNodeController({
  id,
  data,
  selected,
  width,
  height,
}: VideoStoryNodeControllerOptions) {
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const title = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.videoStory, data),
    [data],
  );
  const resolvedWidth = Math.max(
    MIN_WIDTH,
    Math.round(width ?? DEFAULT_WIDTH),
  );
  const resolvedHeight = Math.max(
    MIN_HEIGHT,
    Math.round(height ?? DEFAULT_HEIGHT),
  );
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const status = data.isAnalyzing
    ? 'analyzing'
    : data.analysisError
      ? 'error'
      : rows.length > 0
        ? 'ready'
        : 'empty';

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, resolvedHeight, resolvedWidth, updateNodeInternals]);

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFullscreen]);

  const commitCell = useCallback((
    rowIndex: number,
    column: keyof VideoStoryRow,
    nextValue: string,
  ) => {
    const existing = rows[rowIndex];
    if (!existing) {
      return;
    }
    const previousValue = existing[column];
    const previous = typeof previousValue === 'string'
      ? previousValue
      : previousValue == null
        ? ''
        : String(previousValue);
    if (previous === nextValue) {
      return;
    }
    updateNodeData(id, {
      rows: rows.map((row, index) => (
        index === rowIndex ? { ...row, [column]: nextValue } : row
      )),
    });
  }, [id, rows, updateNodeData]);

  return {
    id,
    selected,
    title,
    size: {
      width: resolvedWidth,
      height: resolvedHeight,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      maxWidth: MAX_WIDTH,
      maxHeight: MAX_HEIGHT,
    },
    rows,
    status,
    errorMessage: data.analysisError ?? '未知错误',
    rawResult: data.rawResult ?? null,
    analysisStartedAt: data.analysisStartedAt ?? null,
    isFullscreen,
    select: () => setSelectedNode(id),
    rename: (displayName: string) => updateNodeData(id, { displayName }),
    openFullscreen: () => setIsFullscreen(true),
    closeFullscreen: () => setIsFullscreen(false),
    commitCell,
  };
}

export type VideoStoryNodeController = ReturnType<
  typeof useVideoStoryNodeController
>;
