// Copyright (c) 2026 AI anime
import type { ViewportBookmark } from '@/modules/creative_canvas/domain/viewportBookmarks';

export interface CanvasViewportPort {
  getViewport: () => ViewportBookmark;
  setViewport: (
    viewport: ViewportBookmark,
    options: {
      duration: number;
      ease?: (progress: number) => number;
      interpolate?: 'smooth';
    },
  ) => unknown;
}

export function captureCurrentViewport(
  viewportPort: CanvasViewportPort,
): ViewportBookmark {
  const { x, y, zoom } = viewportPort.getViewport();
  return { x, y, zoom };
}

const easeInOutCubic = (progress: number): number =>
  progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

export function jumpToBookmark(
  viewportPort: CanvasViewportPort,
  bookmark: ViewportBookmark,
): void {
  void viewportPort.setViewport(
    { x: bookmark.x, y: bookmark.y, zoom: bookmark.zoom },
    { duration: 550, ease: easeInOutCubic, interpolate: 'smooth' },
  );
}
