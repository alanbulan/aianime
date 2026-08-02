// Copyright (c) 2026 AI anime
export const CANVAS_OUTPAINT_ASPECT_RATIOS = [
  "original",
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
] as const;
export type CanvasOutpaintAspectRatio =
  (typeof CANVAS_OUTPAINT_ASPECT_RATIOS)[number];
export const DEFAULT_CANVAS_OUTPAINT_ASPECT_RATIO: CanvasOutpaintAspectRatio =
  "original";

export const CANVAS_OUTPAINT_IMAGE_SIZES = ["1K", "2K", "4K"] as const;
export type CanvasOutpaintImageSize =
  (typeof CANVAS_OUTPAINT_IMAGE_SIZES)[number];
export const DEFAULT_CANVAS_OUTPAINT_IMAGE_SIZE: CanvasOutpaintImageSize = "2K";

export const CANVAS_OUTPAINT_NUM_IMAGES = [1, 2, 3, 4] as const;
export type CanvasOutpaintNumImages =
  (typeof CANVAS_OUTPAINT_NUM_IMAGES)[number];
export const DEFAULT_CANVAS_OUTPAINT_NUM_IMAGES: CanvasOutpaintNumImages = 1;

const OUTPAINT_RATIO_VALUE: Record<
  CanvasOutpaintAspectRatio,
  number | null
> = {
  original: null,
  "1:1": 1,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
};

export interface CanvasOutpaintFrame {
  readonly width: number;
  readonly height: number;
}

export function calculateCanvasOutpaintFrame(
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: CanvasOutpaintAspectRatio,
): CanvasOutpaintFrame {
  const targetRatio = OUTPAINT_RATIO_VALUE[aspectRatio];
  if (targetRatio === null) {
    return { width: sourceWidth, height: sourceHeight };
  }
  const sourceRatio = sourceWidth / sourceHeight;
  if (targetRatio >= sourceRatio) {
    return { width: sourceHeight * targetRatio, height: sourceHeight };
  }
  return { width: sourceWidth, height: sourceWidth / targetRatio };
}
