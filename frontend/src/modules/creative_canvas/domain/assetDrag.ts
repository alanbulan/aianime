// Copyright (c) 2026 AI anime
import type { DirectorWorldSourceDescriptor } from "@/modules/asset_world/public";

export const CANVAS_ASSET_DRAG_MIME = "application/x-freezone-asset";

export type CanvasAssetDragKind = "image" | "video" | "audio" | "model";

/** Serializable asset data shared by library insertion, drag/drop and history restore. */
export interface CanvasAssetDragPayload {
  kind: CanvasAssetDragKind;
  label: string;
  prompt?: string;
  restoreAsGeneratedImage?: boolean;
  model?: string;
  genMode?: string;
  url: string;
  aspectRatio?: string;
  coverUrl?: string | null;
  modelSources?: DirectorWorldSourceDescriptor[];
  activeSourceId?: string | null;
  plyUrl?: string | null;
  panoUrl?: string | null;
  scene?: unknown;
  scenesBySourceId?: Record<string, unknown>;
  sourceFileName?: string;
  source: Record<string, unknown>;
  mainlineContext?: unknown[];
}

export function parseCanvasAssetDragPayload(
  raw: string,
): CanvasAssetDragPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CanvasAssetDragPayload;
    if (!parsed || typeof parsed.url !== "string" || !parsed.url) return null;
    return parsed;
  } catch {
    return null;
  }
}
