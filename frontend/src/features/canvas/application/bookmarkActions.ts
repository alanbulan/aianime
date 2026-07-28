// Copyright (c) 2026 AI anime
import type { ViewportBookmark } from "@/features/canvas/domain/viewportBookmarks";

export interface CanvasViewportPort {
  getViewport: () => ViewportBookmark;
  setViewport: (
    viewport: ViewportBookmark,
    options: {
      duration: number;
      ease?: (progress: number) => number;
      interpolate?: "smooth";
    },
  ) => unknown;
}

/** Snapshot the live camera into a bookmark. */
export function captureCurrentViewport(viewportPort: CanvasViewportPort): ViewportBookmark {
  const { x, y, zoom } = viewportPort.getViewport();
  return { x, y, zoom };
}

/** Ease-in-out cubic: slow start, quick middle, gentle settle — reads as a smooth glide. */
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Animate the camera to a bookmarked viewport with a smooth, eased glide. */
export function jumpToBookmark(viewportPort: CanvasViewportPort, bookmark: ViewportBookmark): void {
  void viewportPort.setViewport(
    { x: bookmark.x, y: bookmark.y, zoom: bookmark.zoom },
    { duration: 550, ease: easeInOutCubic, interpolate: "smooth" },
  );
}
