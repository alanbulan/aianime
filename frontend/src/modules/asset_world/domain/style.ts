// Copyright (c) 2026 AI anime

/** Style list metadata and full style detail share this canonical shape. */
export interface Style {
  id: string;
  name: string;
  label?: string;
  type?: "preset" | "custom";
  is_preset?: boolean;
  base?: string | null;
  style_instructions?: string;
  avoid_instructions?: string;
  style_tag?: string;
  created_at?: string | null;
  created_by?: string | null;
  preview_path?: string | null;
  preview_url?: string | null;
  config?: Record<string, unknown>;
}
