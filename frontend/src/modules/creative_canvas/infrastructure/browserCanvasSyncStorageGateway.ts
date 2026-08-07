// Copyright (c) 2026 AI anime
import { safeLocalStorageSet } from "@/shared/localStorageQuota";

import {
  canvasConflictStorageKey,
  canvasHistoryStorageKey,
  canvasViewportStorageKey,
  isCanvasSyncViewport,
  trimHistoryForStorage,
  type CanvasSyncHistoryState,
  type CanvasSyncStorageGateway,
  type ConflictSnapshot,
  type PersistedCanvasHistory,
} from "../application/canvasSyncStorage";

const HISTORY_STORAGE_MAX_BYTES = 1_500_000;

function readViewport(
  project: string,
  canvasId: string,
): ReturnType<CanvasSyncStorageGateway["readViewport"]> {
  try {
    const raw = localStorage.getItem(canvasViewportStorageKey(project, canvasId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isCanvasSyncViewport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeViewport(
  project: string,
  canvasId: string,
  viewport: Parameters<CanvasSyncStorageGateway["writeViewport"]>[2],
): void {
  safeLocalStorageSet(
    canvasViewportStorageKey(project, canvasId),
    JSON.stringify(viewport),
  );
}

function readHistory<TNode = unknown, TEdge = unknown>(
  project: string,
  canvasId: string,
): PersistedCanvasHistory<TNode, TEdge> | null {
  try {
    const raw = localStorage.getItem(canvasHistoryStorageKey(project, canvasId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<PersistedCanvasHistory<TNode, TEdge>>;
    if (
      typeof value.signature !== "string" ||
      !Array.isArray(value.past) ||
      !Array.isArray(value.future)
    ) {
      return null;
    }
    return {
      signature: value.signature,
      past: value.past,
      future: value.future,
      updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeHistory<TNode = unknown, TEdge = unknown>(
  project: string,
  canvasId: string,
  signature: string,
  history: CanvasSyncHistoryState<TNode, TEdge>,
  now = Date.now(),
): void {
  try {
    const key = canvasHistoryStorageKey(project, canvasId);
    const trimmed = trimHistoryForStorage(history);
    let past = trimmed.past;
    const future = trimmed.future;
    const serialize = () => JSON.stringify({ signature, past, future, updatedAt: now });
    let serialized = serialize();
    while (serialized.length > HISTORY_STORAGE_MAX_BYTES && past.length > 0) {
      past = past.slice(1);
      serialized = serialize();
    }
    if (serialized.length > HISTORY_STORAGE_MAX_BYTES) {
      localStorage.removeItem(key);
      return;
    }
    safeLocalStorageSet(key, serialized);
  } catch {
    // Cross-refresh undo is best-effort when browser storage is unavailable.
  }
}

function clearHistory(project: string, canvasId: string): void {
  try {
    localStorage.removeItem(canvasHistoryStorageKey(project, canvasId));
  } catch {
    // Best-effort cleanup.
  }
}

function readConflictSnapshot(canvasId: string): ConflictSnapshot | null {
  try {
    const raw = localStorage.getItem(canvasConflictStorageKey(canvasId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConflictSnapshot> | null;
    if (
      !parsed ||
      typeof parsed.canvas_id !== "string" ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) {
      return null;
    }
    return {
      canvas_id: parsed.canvas_id,
      nodes: parsed.nodes,
      edges: parsed.edges,
      viewport: parsed.viewport ?? null,
      metadata: (parsed.metadata as Record<string, unknown> | null) ?? null,
      timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : "",
    };
  } catch {
    return null;
  }
}

function writeConflictSnapshot(snapshot: ConflictSnapshot): void {
  safeLocalStorageSet(
    canvasConflictStorageKey(snapshot.canvas_id),
    JSON.stringify(snapshot),
  );
}

function clearConflictSnapshot(canvasId: string): void {
  try {
    localStorage.removeItem(canvasConflictStorageKey(canvasId));
  } catch {
    // Best-effort cleanup.
  }
}

export const browserCanvasSyncStorageGateway: CanvasSyncStorageGateway = {
  readViewport,
  writeViewport,
  readHistory,
  writeHistory,
  clearHistory,
  readConflictSnapshot,
  writeConflictSnapshot,
  clearConflictSnapshot,
};
