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
