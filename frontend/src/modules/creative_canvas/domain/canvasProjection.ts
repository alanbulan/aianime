// Copyright (c) 2026 AI anime
import type { FreezonePresetCanvasRequest } from "./canvasStorage";

export interface FreezoneProjectionPresetRequest
  extends Omit<FreezonePresetCanvasRequest, "canvas_id" | "overwrite_existing"> {
  projection_key: string;
  base_revision: number;
  force_refresh?: boolean;
}

export interface FreezoneProjectionBuildResponse {
  projection_key: string;
  facts_signature: string;
  nodes: unknown[];
  edges: unknown[];
  metadata?: Record<string, unknown> | null;
}

export interface FreezoneProjectionStatusItem {
  projection_key: string;
  stale: boolean;
  scope?: "episode" | "beat" | "asset" | "blank";
  episode?: number | null;
  beat?: number | null;
  asset_kind?: string | null;
  asset_id?: string | null;
  stored_facts_signature?: string;
  current_facts_signature?: string;
  error?: string;
}

export interface FreezoneProjectionStatusResponse {
  canvas_id: string;
  revision?: number | null;
  projections: FreezoneProjectionStatusItem[];
}
