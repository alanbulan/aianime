// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from "react";

import type { CanvasGenerationHistoryRecord } from "@/features/canvas/application/generationHistory";
import { getCanvasGenerationHistory } from "@/features/canvas/composition";
import { readUrl } from "@/lib/url-params";

export interface UseCanvasGenerationHistoryResult {
  records: CanvasGenerationHistoryRecord[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
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
    const project = readUrl().project;
    if (!project) return;
    const canvasId = readUrl().canvas ?? "default";
    setIsLoading(true);
    try {
      const recs = await getCanvasGenerationHistory({
        projectId: project,
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
  }, [nodeIdsKey]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  return { records, isLoading, error, refresh };
}
