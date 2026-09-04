// Copyright (c) 2026 AI anime
export type MultiAnglePresetKey =
  | "custom"
  | "fisheye"
  | "tilted"
  | "frontTopDown"
  | "frontBottomUp"
  | "panoramaTopDown"
  | "backView";

export type MultiAngleZoomLevel =
  | "extreme_close_up"
  | "close_up"
  | "medium_close"
  | "medium"
  | "full_body"
  | "wide"
  | "extreme_wide";

export const MULTI_ANGLE_IMAGE_SIZES = [
  "original",
  "1K",
  "2K",
  "4K",
] as const;
export type MultiAngleImageSize = (typeof MULTI_ANGLE_IMAGE_SIZES)[number];
export const DEFAULT_MULTI_ANGLE_IMAGE_SIZE: MultiAngleImageSize = "original";

export type CanvasMultiViewPreset =
  | "custom"
  | "fisheye"
  | "oblique"
  | "front"
  | "front_up"
  | "back";

const MULTI_ANGLE_PRESET_MAP: Record<
  MultiAnglePresetKey,
  CanvasMultiViewPreset
> = {
  custom: "custom",
  fisheye: "fisheye",
  tilted: "oblique",
  frontTopDown: "front",
  frontBottomUp: "front_up",
  panoramaTopDown: "custom",
  backView: "back",
};

export function resolveMultiAngleGenerationPreset(
  preset: MultiAnglePresetKey,
): CanvasMultiViewPreset {
  return MULTI_ANGLE_PRESET_MAP[preset];
}

export function normalizeMultiAngleYaw(degrees: number): number {
  let normalized = ((degrees + 180) % 360) - 180;
  if (normalized <= -180) normalized += 360;
  return normalized;
}
