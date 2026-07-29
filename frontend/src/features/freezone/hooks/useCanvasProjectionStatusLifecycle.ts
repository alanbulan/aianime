// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useRef, useState } from "react";

import type { CanvasSyncStatus } from "../application/canvasSyncStorage";
import { getProjectionStatuses } from "../composition";
import {
  clearCanvasProjectionStatuses,
  setCanvasProjectionStatuses,
} from "../projectionStatusStore";

const PROJECTION_STATUS_REFRESH_MS = 30_000;

interface ProjectionStatusRevision {
  canvasId: string;
  revision: number;
  refreshToken: number;
}

export function shouldClearProjectionStatuses({
  canvasId,
  hydratedCanvasId,
  projectionKeyCount,
}: {
  canvasId: string;
  hydratedCanvasId: string | null;
  projectionKeyCount: number;
}): boolean {
  return hydratedCanvasId !== canvasId || projectionKeyCount === 0;
}

export function shouldFetchProjectionStatuses({
  canvasId,
  hydratedCanvasId,
  projectionKeyCount,
  revision,
  syncStatus,
}: {
  canvasId: string;
  hydratedCanvasId: string | null;
  projectionKeyCount: number;
  revision: number | null;
  syncStatus: CanvasSyncStatus;
}): boolean {
  if (shouldClearProjectionStatuses({ canvasId, hydratedCanvasId, projectionKeyCount })) {
    return false;
  }
  return syncStatus === "ready" && revision != null;
}

export function shouldSkipProjectionStatusRevision({
  canvasId,
  revision,
  refreshToken,
  lastChecked,
}: {
  canvasId: string;
  revision: number;
  refreshToken: number;
  lastChecked: ProjectionStatusRevision | null;
}): boolean {
  if (lastChecked?.canvasId !== canvasId) return false;
  return lastChecked.revision === revision && lastChecked.refreshToken === refreshToken;
}

function projectionKeysFromMetadata(
  metadata: Record<string, unknown> | null,
): string[] {
  const projections = metadata?.projections;
  if (!projections || typeof projections !== "object") return [];
  return Object.keys(projections).filter((key) => key.trim());
}

export interface CanvasProjectionStatusLifecycleOptions {
  projectId: string;
  canvasId: string;
  hydratedCanvasId: string | null;
  metadata: Record<string, unknown> | null;
  revision: number | null;
  syncStatus: CanvasSyncStatus;
}

export function useCanvasProjectionStatusLifecycle({
  projectId,
  canvasId,
  hydratedCanvasId,
  metadata,
  revision,
  syncStatus,
}: CanvasProjectionStatusLifecycleOptions): void {
  const [refreshToken, setRefreshToken] = useState(0);
  const lastCheckedRef = useRef<ProjectionStatusRevision | null>(null);
  const projectionKeys = useMemo(
    () => projectionKeysFromMetadata(metadata),
    [metadata],
  );

  useEffect(() => {
    if (!shouldFetchProjectionStatuses({
      canvasId,
      hydratedCanvasId,
      projectionKeyCount: projectionKeys.length,
      revision,
      syncStatus,
    })) {
      return;
    }
    const bump = () => setRefreshToken((value) => value + 1);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const timer = window.setInterval(bump, PROJECTION_STATUS_REFRESH_MS);
    return () => {
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(timer);
    };
  }, [
    canvasId,
    hydratedCanvasId,
    projectionKeys.length,
    revision,
    syncStatus,
  ]);

  useEffect(() => {
    if (shouldClearProjectionStatuses({
      canvasId,
      hydratedCanvasId,
      projectionKeyCount: projectionKeys.length,
    })) {
      clearCanvasProjectionStatuses();
      return;
    }
    if (!shouldFetchProjectionStatuses({
      canvasId,
      hydratedCanvasId,
      projectionKeyCount: projectionKeys.length,
      revision,
      syncStatus,
    })) {
      return;
    }
    if (revision == null) {
      return;
    }
    if (shouldSkipProjectionStatusRevision({
      canvasId,
      revision,
      refreshToken,
      lastChecked: lastCheckedRef.current,
    })) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await getProjectionStatuses(projectId, canvasId, projectionKeys);
        if (!cancelled) {
          lastCheckedRef.current = { canvasId, revision, refreshToken };
          setCanvasProjectionStatuses(result.projections);
        }
      } catch {
        if (!cancelled) {
          clearCanvasProjectionStatuses();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    canvasId,
    hydratedCanvasId,
    projectId,
    projectionKeys,
    refreshToken,
    revision,
    syncStatus,
  ]);
}
