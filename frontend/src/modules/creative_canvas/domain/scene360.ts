// Copyright (c) 2026 AI anime
export const CANVAS_SCENE_360_ASPECT_RATIOS = ["2:1", "21:9"] as const;

export type CanvasScene360AspectRatio =
  (typeof CANVAS_SCENE_360_ASPECT_RATIOS)[number];

export const DEFAULT_CANVAS_SCENE_360_ASPECT_RATIO: CanvasScene360AspectRatio =
  "2:1";
