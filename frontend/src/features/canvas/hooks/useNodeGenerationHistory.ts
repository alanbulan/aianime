// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from "react";

import type { CanvasGenerationHistoryRecord } from "@/features/canvas/application/generationHistory";
import { getNodeGenerationHistory } from "@/features/canvas/composition";
import { readUrl } from "@/lib/url-params";

export interface UseNodeGenerationHistoryResult {
  records: CanvasGenerationHistoryRecord[];
  isLoading: boolean;
  error: Error | null;
  /** Re-fetch the node's history (e.g. after a generation completes). */
  refresh: () => Promise<void>;
}

/**
 * Read a node's per-node generation history from the backend.
 *
 * History lives outside the canvas JSON, so this is a plain on-demand fetch —
 * not part of the canvas save/load flow. Pass `enabled: false` (e.g. while the
 * node is collapsed / unselected) to avoid fetching for every node on the
 * canvas; flipping it to `true` triggers a fetch. Call {@link refresh} after a
 * generation finishes to pull in the new record.
 */
export function useNodeGenerationHistory(
  nodeId: string,
  options?: { enabled?: boolean; limit?: number },
): UseNodeGenerationHistoryResult {
  const enabled = options?.enabled ?? true;
  const limit = options?.limit ?? 100;
  const [records, setRecords] = useState<CanvasGenerationHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    const project = readUrl().project;
    if (!project || !nodeId) return;
    const canvasId = readUrl().canvas ?? "default";
    setIsLoading(true);
    try {
      const recs = await getNodeGenerationHistory({
        projectId: project,
        canvasId,
        nodeId,
        limit,
      });
      setRecords(recs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [nodeId, limit]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  return { records, isLoading, error, refresh };
}
