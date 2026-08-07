// Copyright (c) 2026 AI anime
import {
  isStaleByTtl,
  pruneLocalStorageByPrefix,
  registerStorageReclaimer,
} from "@/shared/localStorageQuota";

import {
  CANVAS_CONFLICT_PREFIX,
  CANVAS_DRAFT_PREFIX,
  CANVAS_HISTORY_PREFIX,
  CANVAS_VIEWPORT_PREFIX,
  FREEZONE_CANVAS_TTL_MS,
} from "../domain/canvasStorageRetention";

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

export function pruneFreezoneCanvasStorage(now = Date.now()): void {
  pruneLocalStorageByPrefix(isFreezoneCanvasKey, (key, raw) =>
    shouldReclaimFreezoneEntry(key, raw, now),
  );
}

export function installBrowserCanvasStorageReclaimer(): () => void {
  return registerStorageReclaimer(pruneFreezoneCanvasStorage);
}
