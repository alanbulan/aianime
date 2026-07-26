// Copyright (c) 2026 AI anime
export const CANVAS_REDRAW_ASPECT_RATIOS = [
  "original",
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
] as const;
export type CanvasRedrawAspectRatio =
  (typeof CANVAS_REDRAW_ASPECT_RATIOS)[number];
export const DEFAULT_CANVAS_REDRAW_ASPECT_RATIO: CanvasRedrawAspectRatio =
  "original";

export const CANVAS_REDRAW_IMAGE_SIZES = ["1K", "2K", "4K"] as const;
export type CanvasRedrawImageSize =
  (typeof CANVAS_REDRAW_IMAGE_SIZES)[number];
export const DEFAULT_CANVAS_REDRAW_IMAGE_SIZE: CanvasRedrawImageSize = "2K";

export const CANVAS_REDRAW_NUM_IMAGES = [1, 2, 3, 4] as const;
export type CanvasRedrawNumImages =
  (typeof CANVAS_REDRAW_NUM_IMAGES)[number];
export const DEFAULT_CANVAS_REDRAW_NUM_IMAGES: CanvasRedrawNumImages = 1;

export function resolveCanvasRedrawAspectRatio(
  value: unknown,
): CanvasRedrawAspectRatio {
  return typeof value === "string" &&
    (CANVAS_REDRAW_ASPECT_RATIOS as readonly string[]).includes(value)
    ? (value as CanvasRedrawAspectRatio)
    : DEFAULT_CANVAS_REDRAW_ASPECT_RATIO;
}

export function resolveCanvasRedrawImageSize(
  value: unknown,
): CanvasRedrawImageSize {
  return typeof value === "string" &&
    (CANVAS_REDRAW_IMAGE_SIZES as readonly string[]).includes(value)
    ? (value as CanvasRedrawImageSize)
    : DEFAULT_CANVAS_REDRAW_IMAGE_SIZE;
}
