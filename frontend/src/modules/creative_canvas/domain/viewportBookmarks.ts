// Copyright (c) 2026 AI anime

export interface ViewportBookmark {
  x: number;
  y: number;
  zoom: number;
}

export type ViewportBookmarks = (ViewportBookmark | null)[];

export const BOOKMARK_SLOT_COUNT = 10;

export function resolveCanvasOriginViewport(
  size: { width: number; height: number } | null | undefined,
  zoom = 1,
): ViewportBookmark {
  if (!size || size.width <= 0 || size.height <= 0) {
    return { x: 0, y: 0, zoom: 1 };
  }
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    x: size.width / 2,
    y: size.height / 2,
    zoom: safeZoom,
  };
}

export function createEmptyBookmarks(): ViewportBookmarks {
  return Array.from({ length: BOOKMARK_SLOT_COUNT }, () => null);
}

export function replaceViewportBookmark(
  bookmarks: ViewportBookmarks,
  index: number,
  bookmark: ViewportBookmark | null,
): ViewportBookmarks {
  if (!Number.isInteger(index) || index < 0 || index >= BOOKMARK_SLOT_COUNT) {
    return bookmarks;
  }
  const next = bookmarks.slice();
  next[index] = bookmark
    ? { x: bookmark.x, y: bookmark.y, zoom: bookmark.zoom }
    : null;
  return next;
}

export function digitToBookmarkIndex(digit: string): number | null {
  if (!/^[0-9]$/.test(digit)) {
    return null;
  }
  return digit === '0' ? 9 : Number(digit) - 1;
}

export function bookmarkIndexToDigit(index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= BOOKMARK_SLOT_COUNT) {
    return null;
  }
  return index === 9 ? '0' : String(index + 1);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isViewportBookmark(value: unknown): value is ViewportBookmark {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    isFiniteNumber(candidate.x)
    && isFiniteNumber(candidate.y)
    && isFiniteNumber(candidate.zoom)
    && candidate.zoom > 0
  );
}

export function normalizeBookmarks(input: unknown): ViewportBookmarks {
  const result = createEmptyBookmarks();
  if (!Array.isArray(input)) {
    return result;
  }
  for (let index = 0; index < BOOKMARK_SLOT_COUNT; index += 1) {
    const slot = input[index];
    if (isViewportBookmark(slot)) {
      result[index] = { x: slot.x, y: slot.y, zoom: slot.zoom };
    }
  }
  return result;
}

export function bookmarkCenterInFlow(
  bookmark: ViewportBookmark,
  size: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: (size.width / 2 - bookmark.x) / bookmark.zoom,
    y: (size.height / 2 - bookmark.y) / bookmark.zoom,
  };
}

export interface MinimapViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function projectToMinimap(
  point: { x: number; y: number },
  viewBox: MinimapViewBox,
  size: { width: number; height: number },
): { x: number; y: number } {
  const safeWidth = viewBox.width > 0 ? viewBox.width : 1;
  const safeHeight = viewBox.height > 0 ? viewBox.height : 1;
  const x = ((point.x - viewBox.x) / safeWidth) * size.width;
  const y = ((point.y - viewBox.y) / safeHeight) * size.height;
  return {
    x: Math.min(size.width, Math.max(0, x)),
    y: Math.min(size.height, Math.max(0, y)),
  };
}
