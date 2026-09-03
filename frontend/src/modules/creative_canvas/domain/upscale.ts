// Copyright (c) 2026 AI anime
export const CANVAS_UPSCALE_IMAGE_SIZES = ["1K", "2K", "4K"] as const;
export type CanvasUpscaleImageSize =
  (typeof CANVAS_UPSCALE_IMAGE_SIZES)[number];
export const DEFAULT_CANVAS_UPSCALE_IMAGE_SIZE: CanvasUpscaleImageSize = "2K";

export function resolveCanvasUpscaleImageSize(
  value: unknown,
): CanvasUpscaleImageSize {
  return typeof value === "string" &&
    (CANVAS_UPSCALE_IMAGE_SIZES as readonly string[]).includes(value)
    ? (value as CanvasUpscaleImageSize)
    : DEFAULT_CANVAS_UPSCALE_IMAGE_SIZE;
}
