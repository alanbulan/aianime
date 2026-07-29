// Copyright (c) 2026 AI anime
import type {
  CanvasHistorySnapshot,
  CanvasHistoryState,
} from "@/features/canvas/domain/canvasHistory";
import type { ViewportBookmark } from "@/features/canvas/domain/viewportBookmarks";

export const HISTORY_PERSIST_MAX_STEPS = 10;
export const CANVAS_HISTORY_PREFIX = "freezone:canvas-history:";
export const CANVAS_CONFLICT_PREFIX = "freezone:conflict:";
export const CANVAS_VIEWPORT_PREFIX = "freezone:canvas-viewport:";

export type CanvasSyncStatus =
  | "loading"
  | "ready"
  | "saving"
  | "error"
  | "conflict";

export interface PersistedCanvasHistory {
  signature: string;
  past: CanvasHistorySnapshot[];
  future: CanvasHistorySnapshot[];
  updatedAt: number;
}

export interface ConflictSnapshot {
  canvas_id: string;
  nodes: unknown[];
  edges: unknown[];
  viewport: unknown;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export interface CanvasSyncStorageGateway {
  readViewport(project: string, canvasId: string): ViewportBookmark | null;
  writeViewport(
    project: string,
    canvasId: string,
    viewport: ViewportBookmark,
  ): void;
  readHistory(project: string, canvasId: string): PersistedCanvasHistory | null;
  writeHistory(
    project: string,
    canvasId: string,
    signature: string,
    history: CanvasHistoryState,
    now?: number,
  ): void;
  clearHistory(project: string, canvasId: string): void;
  readConflictSnapshot(canvasId: string): ConflictSnapshot | null;
  writeConflictSnapshot(snapshot: ConflictSnapshot): void;
  clearConflictSnapshot(canvasId: string): void;
}

export function canvasViewportStorageKey(
  project: string,
  canvasId: string,
): string {
  return `${CANVAS_VIEWPORT_PREFIX}${project}:${canvasId}`;
}

export function canvasHistoryStorageKey(
  project: string,
  canvasId: string,
): string {
  return `${CANVAS_HISTORY_PREFIX}${project}:${canvasId}`;
}

export function canvasConflictStorageKey(canvasId: string): string {
  return `${CANVAS_CONFLICT_PREFIX}${canvasId}`;
}

export function isCanvasSyncViewport(
  value: unknown,
): value is ViewportBookmark {
  if (typeof value !== "object" || value === null) return false;
  const viewport = value as Partial<ViewportBookmark>;
  return (
    typeof viewport.x === "number" &&
    typeof viewport.y === "number" &&
    typeof viewport.zoom === "number"
  );
}

export function trimHistoryForStorage(
  history: CanvasHistoryState,
  maxSteps = HISTORY_PERSIST_MAX_STEPS,
): { past: CanvasHistorySnapshot[]; future: CanvasHistorySnapshot[] } {
  return {
    past: history.past.slice(-maxSteps),
    future: history.future.slice(0, maxSteps),
  };
}

export function buildConflictCopyCanvasId(
  sourceCanvasId: string,
  now = Date.now(),
  random = Math.random().toString(36).slice(2, 8),
): string {
  const safeSource =
    sourceCanvasId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "canvas";
  const safeRandom = random.replace(/[^a-z0-9]+/g, "").slice(0, 8) || "copy";
  return `copy_${now}_${safeRandom}_${safeSource}`
    .slice(0, 64)
    .replace(/_+$/g, "");
}

export function buildConflictCopyMetadata({
  sourceCanvasId,
  metadata,
}: {
  sourceCanvasId: string;
  metadata: Record<string, unknown> | null | undefined;
}): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    canvas_origin: "conflict_copy",
    source_canvas_id: sourceCanvasId,
  };
}
