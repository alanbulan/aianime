// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  DEFAULT_ASPECT_RATIO,
  type CanvasNode,
} from '../domain/canvasNodes';

const STORYBOARD_SPLIT_NODE_MIN_WIDTH = 440;
const STORYBOARD_SPLIT_NODE_MAX_WIDTH = 860;
const STORYBOARD_SPLIT_FRAME_TARGET_WIDTH = 150;
const STORYBOARD_SPLIT_FRAME_NOTE_HEIGHT = 40;
const STORYBOARD_SPLIT_NODE_CHROME_HEIGHT = 70;
const STORYBOARD_SPLIT_GRID_GAP = 1;

function parseAspectRatioValue(aspectRatio: string | undefined): number {
  const [rawWidth = '1', rawHeight = '1'] = (
    aspectRatio || DEFAULT_ASPECT_RATIO
  ).split(':');
  const width = Number(rawWidth);
  const height = Number(rawHeight);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 1;
  }
  return width / height;
}

export function resolveStoryboardSplitNodeDimensions(
  rows: number,
  cols: number,
  frameAspectRatio: string | undefined,
): { width: number; height: number } {
  const safeRows = Math.max(1, Math.floor(rows));
  const safeCols = Math.max(1, Math.floor(cols));
  const width = Math.round(Math.max(
    STORYBOARD_SPLIT_NODE_MIN_WIDTH,
    Math.min(
      STORYBOARD_SPLIT_NODE_MAX_WIDTH,
      safeCols * STORYBOARD_SPLIT_FRAME_TARGET_WIDTH
        + (safeCols - 1) * STORYBOARD_SPLIT_GRID_GAP
        + 16,
    ),
  ));
  const contentWidth = Math.max(1, width - 16);
  const frameWidth = Math.max(
    1,
    (contentWidth - (safeCols - 1) * STORYBOARD_SPLIT_GRID_GAP) / safeCols,
  );
  const frameImageHeight = frameWidth / parseAspectRatioValue(frameAspectRatio);
  const frameHeight = frameImageHeight + STORYBOARD_SPLIT_FRAME_NOTE_HEIGHT;
  const gridHeight =
    safeRows * frameHeight + (safeRows - 1) * STORYBOARD_SPLIT_GRID_GAP;
  const height = Math.round(Math.max(
    320,
    Math.min(1600, gridHeight + STORYBOARD_SPLIT_NODE_CHROME_HEIGHT),
  ));

  return { width, height };
}

export function resolveDerivedAspectRatio(
  sourceNode: CanvasNode | undefined,
  fallbackAspectRatio: string,
): string {
  if (!sourceNode) {
    return fallbackAspectRatio;
  }

  if (sourceNode.type === CANVAS_NODE_TYPES.storyboardGen) {
    const data = sourceNode.data as {
      requestAspectRatio?: string;
      aspectRatio?: string;
    };
    const preferred = data.requestAspectRatio && data.requestAspectRatio !== 'auto'
      ? data.requestAspectRatio
      : data.aspectRatio;
    return preferred || fallbackAspectRatio;
  }

  if (sourceNode.type === CANVAS_NODE_TYPES.storyboardSplit) {
    const data = sourceNode.data as {
      frameAspectRatio?: string;
      aspectRatio?: string;
    };
    return data.frameAspectRatio || data.aspectRatio || fallbackAspectRatio;
  }

  if (sourceNode.type === CANVAS_NODE_TYPES.imageEdit) {
    const data = sourceNode.data as {
      requestAspectRatio?: string;
      aspectRatio?: string;
    };
    const preferred = data.requestAspectRatio && data.requestAspectRatio !== 'auto'
      ? data.requestAspectRatio
      : data.aspectRatio;
    return preferred || fallbackAspectRatio;
  }

  const imageLikeAspect = (sourceNode.data as { aspectRatio?: string }).aspectRatio;
  return imageLikeAspect || fallbackAspectRatio;
}
