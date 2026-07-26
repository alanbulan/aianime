// Copyright (c) 2026 AI anime
export const CANVAS_VIDEO_UPSCALE_RESOLUTIONS = ["1080p", "2k", "4k"] as const;
export type CanvasVideoUpscaleResolution =
  (typeof CANVAS_VIDEO_UPSCALE_RESOLUTIONS)[number];
export const DEFAULT_CANVAS_VIDEO_UPSCALE_RESOLUTION: CanvasVideoUpscaleResolution =
  "1080p";

export const CANVAS_VIDEO_UPSCALE_RESOLUTION_LABEL: Record<
  CanvasVideoUpscaleResolution,
  string
> = {
  "1080p": "1080P",
  "2k": "2K",
  "4k": "4K",
};

export const CANVAS_VIDEO_UPSCALE_DENOISE_OPTIONS = ["none", "1x", "2x"] as const;
export type CanvasVideoUpscaleDenoise =
  (typeof CANVAS_VIDEO_UPSCALE_DENOISE_OPTIONS)[number];
export const DEFAULT_CANVAS_VIDEO_UPSCALE_DENOISE: CanvasVideoUpscaleDenoise =
  "1x";

export function resolveCanvasVideoUpscaleResolution(
  value: unknown,
): CanvasVideoUpscaleResolution {
  return typeof value === "string" &&
    (CANVAS_VIDEO_UPSCALE_RESOLUTIONS as readonly string[]).includes(value)
    ? (value as CanvasVideoUpscaleResolution)
    : DEFAULT_CANVAS_VIDEO_UPSCALE_RESOLUTION;
}

export function resolveCanvasVideoUpscaleDenoise(
  value: unknown,
): CanvasVideoUpscaleDenoise {
  return typeof value === "string" &&
    (CANVAS_VIDEO_UPSCALE_DENOISE_OPTIONS as readonly string[]).includes(value)
    ? (value as CanvasVideoUpscaleDenoise)
    : DEFAULT_CANVAS_VIDEO_UPSCALE_DENOISE;
}
