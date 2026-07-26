// Copyright (c) 2026 AI anime
export type FreezoneCanvasScope = "default" | "episode" | "beat" | "asset";

export interface FreezoneCanvasSummary {
  id: string;
  modified_at: string;
  size: number;
  schema_version?: 2 | number | null;
  canvas_scope?: FreezoneCanvasScope | string | null;
  episode?: number | null;
  beat?: number | null;
  asset_target?: Record<string, unknown> | null;
  revision?: number | null;
  metadata?: Record<string, unknown> | null;
}

export type CanvasSaveSource =
  | "autosave"
  | "manual_save"
  | "manual_clear"
  | "restore"
  | "from_preset"
  | "projection_remove"
  | "import";

export type CanvasBackupStatus = "disabled" | "synced" | "pending" | "failed";

export interface FreezoneCanvasPayload {
  schema_version?: 2;
  canvas_id?: string;
  project_id?: string;
  canvas_scope?: FreezoneCanvasScope;
  owner_principal_type?: "user" | "team";
  owner_principal_id?: string;
  access_model?: "project_role";
  min_project_role?: "viewer" | "editor" | "admin";
  episode?: number | null;
  beat?: number | null;
  asset_target?: Record<string, unknown> | null;
  revision?: number | null;
  base_revision?: number | null;
  /** Idempotency token shared by retries of the same logical save. */
  client_save_id?: string;
  save_source?: CanvasSaveSource;
  /** Only true when the user explicitly cleared the canvas. */
  allow_empty_overwrite?: boolean;
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
  nodes: unknown[];
  edges: unknown[];
  viewport?: unknown;
  /** Opaque Freezone state that is not part of the xyflow graph. */
  metadata?: Record<string, unknown> | null;
}

export interface FreezoneCanvasSaveResult {
  saved: boolean;
  revision: number;
  updated_at?: string;
  client_save_id?: string;
  backup_status?: CanvasBackupStatus;
}

export interface CreateBlankFreezoneCanvasRequest {
  canvasId: string;
  name: string;
  creatorUsername?: string | null;
}

export interface FreezonePresetCanvasRequest {
  scope: "episode" | "beat" | "asset" | "blank";
  episode?: number | null;
  beat?: number | null;
  primary_slot?: string;
  asset_kind?: string | null;
  character?: string | null;
  identity_id?: string | null;
  asset_id?: string | null;
  canvas_id?: string | null;
  overwrite_existing?: boolean;
  base_revision?: number | null;
}

export interface FreezonePresetCanvasResponse {
  canvas_id: string;
  reused: boolean;
  url: string;
}

export interface FreezoneCanvasHistoryEntry {
  id?: string;
  history_id?: string;
  filename?: string;
  name?: string;
  revision?: number | null;
  size?: number | null;
  modified_at?: string | null;
  save_source?: string | null;
  updated_by?: string | null;
  [key: string]: unknown;
}

export interface FreezoneCanvasRestoreRequest {
  history_id: string;
  /** Current revision for optimistic locking; null or omitted forces replace. */
  base_revision?: number | null;
}

export function extractHistoryId(
  entry: FreezoneCanvasHistoryEntry,
): string | null {
  for (const key of ["history_id", "id", "filename", "name"] as const) {
    const value = entry[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}
