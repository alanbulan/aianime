// Copyright (c) 2026 AI anime

// Mirrors backend PoolImage plus the URL and stale fields projected by GET /grids.
export interface PoolImage {
  id: string;
  type: "render" | "sketch";
  mode: string;
  grid_index: number;
  cell_index: number;
  row: number;
  col: number;
  original_beat: number;
  cell_url: string;
  grid_url: string;
  cell_path?: string | null;
  grid_path: string;
  generated_at?: string | null;
  model?: string | null;
  model_selector?: string | null;
  stale: boolean;
  beat_content_hash?: string | null;
}

export interface ImagePoolData {
  episode: number;
  modes: Record<string, unknown>;
  images: PoolImage[];
  beat_assignments: Record<string, string>;
}

export interface ImagePoolRebuildResult {
  episode: number;
  image_count: number;
}

export type BeatImageType = "sketch" | "render";

export interface BeatImageUploadResult {
  beatNum: number;
  poolId: string;
  sketchUrl?: string;
  frameUrl?: string;
}

export interface ImagePoolSelectionResult extends BeatImageUploadResult {
  imageType?: BeatImageType;
}

export function imagePoolModelSource(image: PoolImage): {
  label: string;
  tooltip: string;
} | null {
  const selector = image.model_selector?.trim() ?? "";
  const model = image.model?.trim() ?? "";
  if (!selector && !model) return null;
  const selectorParts = selector.split(":");
  const selectorModel =
    selectorParts[selectorParts.length - 1]?.trim() ?? "";
  return {
    label: selectorModel || model || selector,
    tooltip: selector || model,
  };
}
