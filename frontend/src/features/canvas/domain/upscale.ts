// Copyright (c) 2026 AI anime
export const CANVAS_UPSCALE_IMAGE_SIZES = ["1K", "2K", "4K"] as const;
export type CanvasUpscaleImageSize =
  (typeof CANVAS_UPSCALE_IMAGE_SIZES)[number];
export const DEFAULT_CANVAS_UPSCALE_IMAGE_SIZE: CanvasUpscaleImageSize = "2K";

export const CANVAS_UPSCALE_SCALE_FACTORS = [2, 4, 6] as const;
export type CanvasUpscaleScaleFactor =
  (typeof CANVAS_UPSCALE_SCALE_FACTORS)[number];
export const DEFAULT_CANVAS_UPSCALE_SCALE_FACTOR: CanvasUpscaleScaleFactor = 2;

export function resolveCanvasUpscaleImageSize(
  value: unknown,
): CanvasUpscaleImageSize {
  return typeof value === "string" &&
    (CANVAS_UPSCALE_IMAGE_SIZES as readonly string[]).includes(value)
    ? (value as CanvasUpscaleImageSize)
    : DEFAULT_CANVAS_UPSCALE_IMAGE_SIZE;
}

export function resolveCanvasUpscaleScaleFactor(
  value: unknown,
): CanvasUpscaleScaleFactor {
  return typeof value === "number" &&
    (CANVAS_UPSCALE_SCALE_FACTORS as readonly number[]).includes(value)
    ? (value as CanvasUpscaleScaleFactor)
    : DEFAULT_CANVAS_UPSCALE_SCALE_FACTOR;
}
