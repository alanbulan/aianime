// Copyright (c) 2026 AI anime
import {
  isStaleByTtl,
  pruneLocalStorageByPrefix,
  registerStorageReclaimer,
  safeLocalStorageSet,
} from "@/lib/localStorageQuota";

import {
  CANVAS_DRAFT_MAX_BYTES,
  CANVAS_DRAFT_PREFIX,
  FREEZONE_CANVAS_TTL_MS,
  canvasDraftStorageKey,
  createStoredCanvasDraft,
  parseStoredCanvasDraft,
  type CanvasDraftInput,
  type CanvasDraftStorageGateway,
  type StoredCanvasDraft,
} from "../application/canvasDraft";
import {
  CANVAS_CONFLICT_PREFIX,
  CANVAS_HISTORY_PREFIX,
  CANVAS_VIEWPORT_PREFIX,
} from "../application/canvasSyncStorage";

function readDraft(
  project: string,
  canvasId: string,
): StoredCanvasDraft | null {
  try {
    const raw = localStorage.getItem(canvasDraftStorageKey(project, canvasId));
    if (!raw) return null;
    return parseStoredCanvasDraft(JSON.parse(raw) as unknown, project, canvasId);
  } catch {
    return null;
  }
}

function clearDraft(project: string, canvasId: string): void {
  try {
    localStorage.removeItem(canvasDraftStorageKey(project, canvasId));
  } catch {
    // Best-effort cleanup.
  }
}

function writeDraft(
  project: string,
  canvasId: string,
  input: CanvasDraftInput,
): boolean {
  const draft = createStoredCanvasDraft(project, canvasId, input);
  const withoutHistory: StoredCanvasDraft = { ...draft, history: null };
  const key = canvasDraftStorageKey(project, canvasId);

  try {
    const serialized = JSON.stringify(draft);
    if (
      serialized.length <= CANVAS_DRAFT_MAX_BYTES &&
      safeLocalStorageSet(key, serialized)
    ) {
      return true;
    }
  } catch {
    // Fall through and try the no-history draft.
  }

  try {
    const serialized = JSON.stringify(withoutHistory);
    if (
      serialized.length <= CANVAS_DRAFT_MAX_BYTES &&
      safeLocalStorageSet(key, serialized)
    ) {
      return true;
    }
    clearDraft(project, canvasId);
    return false;
  } catch {
    clearDraft(project, canvasId);
    return false;
  }
}

function isFreezoneCanvasKey(key: string): boolean {
  return (
    key.startsWith(CANVAS_DRAFT_PREFIX) ||
    key.startsWith(CANVAS_HISTORY_PREFIX) ||
    key.startsWith(CANVAS_CONFLICT_PREFIX) ||
    key.startsWith(CANVAS_VIEWPORT_PREFIX)
  );
}

function freezoneEntryTimestamp(key: string, parsed: unknown): number | null {
  if (!parsed || typeof parsed !== "object") return null;
  if (key.startsWith(CANVAS_CONFLICT_PREFIX)) {
    const timestamp = (parsed as { timestamp?: unknown }).timestamp;
    if (typeof timestamp !== "string") return null;
    const milliseconds = Date.parse(timestamp);
    return Number.isNaN(milliseconds) ? null : milliseconds;
  }
  const updatedAt = (parsed as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === "number" ? updatedAt : null;
}

function shouldReclaimFreezoneEntry(
  key: string,
  raw: string,
  now: number,
): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return true;
  }
  if (key.startsWith(CANVAS_VIEWPORT_PREFIX)) {
    return !parsed || typeof parsed !== "object";
  }
  const updatedAt = freezoneEntryTimestamp(key, parsed);
  if (updatedAt == null) return true;
  return isStaleByTtl(updatedAt, now, FREEZONE_CANVAS_TTL_MS);
}

function pruneFreezoneCanvasStorage(now = Date.now()): void {
  pruneLocalStorageByPrefix(isFreezoneCanvasKey, (key, raw) =>
    shouldReclaimFreezoneEntry(key, raw, now),
  );
}

export const browserCanvasDraftStorageGateway: CanvasDraftStorageGateway = {
  readDraft,
  writeDraft,
  clearDraft,
  prune: pruneFreezoneCanvasStorage,
};

export function installBrowserCanvasStorageReclaimer(): () => void {
  return registerStorageReclaimer(pruneFreezoneCanvasStorage);
}
