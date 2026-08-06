// Copyright (c) 2026 AI anime
import { safeLocalStorageSet } from "@/shared/storage/localStorageQuota";

import {
  CANVAS_DRAFT_MAX_BYTES,
  canvasDraftStorageKey,
  createStoredCanvasDraft,
  parseStoredCanvasDraft,
  type CanvasDraftInput,
  type CanvasDraftStorageGateway,
  type StoredCanvasDraft,
} from "../application/canvasDraft";

function readDraft<TNode = unknown, TEdge = unknown>(
  project: string,
  canvasId: string,
): StoredCanvasDraft<TNode, TEdge> | null {
  try {
    const raw = localStorage.getItem(canvasDraftStorageKey(project, canvasId));
    if (!raw) return null;
    return parseStoredCanvasDraft<TNode, TEdge>(
      JSON.parse(raw) as unknown,
      project,
      canvasId,
    );
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

function writeDraft<TNode = unknown, TEdge = unknown>(
  project: string,
  canvasId: string,
  input: CanvasDraftInput<TNode, TEdge>,
): boolean {
  const draft = createStoredCanvasDraft(project, canvasId, input);
  const withoutHistory: StoredCanvasDraft<TNode, TEdge> = {
    ...draft,
    history: null,
  };
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

export const browserCanvasDraftStorageGateway: CanvasDraftStorageGateway = {
  readDraft,
  writeDraft,
  clearDraft,
};
