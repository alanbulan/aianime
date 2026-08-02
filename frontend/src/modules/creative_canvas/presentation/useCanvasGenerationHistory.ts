// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from "react";

import type {
  CanvasGenerationHistoryRecord,
} from "../domain/generationHistoryRecord";
import { getCanvasGenerationHistory } from "../generationHistoryComposition";

export interface UseCanvasGenerationHistoryResult {
  records: CanvasGenerationHistoryRecord[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export interface CanvasGenerationHistoryContext {
  projectId: string;
  canvasId: string | null;
}

/**
 * Read the whole canvas's generation history for the history-assets modal.
 *
 * Prefers the canvas-level aggregate endpoint, which merges every node that
 * ever recorded history on this canvas — including nodes since deleted from the
 * canvas — so deleting a node no longer drops its past generations from the
 * browser.
 *
 * `fallbackNodeIds` are the live canvas node ids used ONLY when the backend does
 * not yet expose the aggregate route (404 during a frontend-ahead-of-backend
 * deploy). In that window we fall back to the old per-node fan-out so existing
 * users' history still shows (minus deleted nodes — the pre-existing behavior).
 * Once the backend ships the route, deleted-node history is recovered too.
 *
 * History lives outside the canvas JSON, so this is a plain on-demand fetch
 * gated by `enabled` (the modal only mounts when opened).
 */
export function useCanvasGenerationHistory(
  { projectId, canvasId }: CanvasGenerationHistoryContext,
  fallbackNodeIds: string[],
  options?: { enabled?: boolean },
): UseCanvasGenerationHistoryResult {
  const enabled = options?.enabled ?? true;
  const [records, setRecords] = useState<CanvasGenerationHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Snapshot the ids as a stable string so the callback identity only changes
  // when the actual id set changes (not on every nodes-array reference churn).
  const nodeIdsKey = fallbackNodeIds.join(",");

  const refresh = useCallback(async () => {
    if (!canvasId) return;
    setIsLoading(true);
    try {
      const recs = await getCanvasGenerationHistory({
        projectId,
        canvasId,
        fallbackNodeIds: nodeIdsKey ? nodeIdsKey.split(",") : [],
      });
      setRecords(recs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [canvasId, nodeIdsKey, projectId]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  return { records, isLoading, error, refresh };
}
