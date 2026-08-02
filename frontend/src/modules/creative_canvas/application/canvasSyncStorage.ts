// Copyright (c) 2026 AI anime
import {
  CANVAS_CONFLICT_PREFIX,
  CANVAS_HISTORY_PREFIX,
  CANVAS_VIEWPORT_PREFIX,
} from "../domain/canvasStorageRetention";

export const HISTORY_PERSIST_MAX_STEPS = 10;

export type CanvasSyncStatus =
  | "loading"
  | "ready"
  | "saving"
  | "error"
  | "conflict";

export interface CanvasSyncViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasSyncHistorySnapshot<TNode = unknown, TEdge = unknown> {
  nodes: TNode[];
  edges: TEdge[];
}

export interface CanvasSyncHistoryState<TNode = unknown, TEdge = unknown> {
  past: CanvasSyncHistorySnapshot<TNode, TEdge>[];
  future: CanvasSyncHistorySnapshot<TNode, TEdge>[];
}

export interface PersistedCanvasHistory<TNode = unknown, TEdge = unknown> {
  signature: string;
  past: CanvasSyncHistorySnapshot<TNode, TEdge>[];
  future: CanvasSyncHistorySnapshot<TNode, TEdge>[];
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
  readViewport(project: string, canvasId: string): CanvasSyncViewport | null;
  writeViewport(
    project: string,
    canvasId: string,
    viewport: CanvasSyncViewport,
  ): void;
  readHistory<TNode = unknown, TEdge = unknown>(
    project: string,
    canvasId: string,
  ): PersistedCanvasHistory<TNode, TEdge> | null;
  writeHistory<TNode = unknown, TEdge = unknown>(
    project: string,
    canvasId: string,
    signature: string,
    history: CanvasSyncHistoryState<TNode, TEdge>,
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
): value is CanvasSyncViewport {
  if (typeof value !== "object" || value === null) return false;
  const viewport = value as Partial<CanvasSyncViewport>;
  return (
    typeof viewport.x === "number" &&
    typeof viewport.y === "number" &&
    typeof viewport.zoom === "number"
  );
}

export function trimHistoryForStorage<TNode = unknown, TEdge = unknown>(
  history: CanvasSyncHistoryState<TNode, TEdge>,
  maxSteps = HISTORY_PERSIST_MAX_STEPS,
): {
  past: CanvasSyncHistorySnapshot<TNode, TEdge>[];
  future: CanvasSyncHistorySnapshot<TNode, TEdge>[];
} {
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
