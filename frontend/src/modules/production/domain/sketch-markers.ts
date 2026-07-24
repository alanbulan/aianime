// Copyright (c) 2026 AI anime

export interface AssignColorsResult {
  colors: Record<string, string>;
  count: number;
  prop_colors?: Record<string, string>;
  prop_count?: number;
}

export interface DetectIdentitiesResult {
  detections: Record<string, string[]>;
  identity_detections?: Record<string, string[]>;
  prop_detections?: Record<string, string[]>;
  total_beats: number;
  total_identities: number;
  total_props?: number;
  review_message?: string;
}
