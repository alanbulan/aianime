// Copyright (c) 2026 AI anime
import { useCallback } from "react";

import { useCanvasStore } from "@/features/canvas/canvasStore";

import type { CanvasSyncStatus } from "../application/canvasSyncStorage";
import { refreshCanvasPreset } from "../canvasPresetRefreshComposition";

interface ValueRef<T> {
  current: T;
}

export interface CanvasPresetRefreshControllerOptions {
  project: string;
  canvasId: string;
  metadata: Record<string, unknown> | null;
  revision: number | null;
  hydratedCanvasId: string | null;
  revisionRef: ValueRef<number | null>;
  flush(): Promise<boolean>;
  reload(): void;
  setStatus(status: CanvasSyncStatus): void;
  setError(error: string | null): void;
}

export interface CanvasPresetRefreshController {
  restoreMainlineDefault(options?: { bestEffort?: boolean }): Promise<string>;
}

export function useCanvasPresetRefreshController({
  project,
  canvasId,
  metadata,
  revision,
  hydratedCanvasId,
  revisionRef,
  flush,
  reload,
  setStatus,
  setError,
}: CanvasPresetRefreshControllerOptions): CanvasPresetRefreshController {
  const restoreMainlineDefault = useCallback(
    async (options?: { bestEffort?: boolean }) =>
      await refreshCanvasPreset({
        project,
        canvasId,
        preset: metadata?.preset,
        revision,
        hydratedCanvasId,
        userEditsSinceHydrate:
          useCanvasStore.getState().userEditsSinceHydrate,
        bestEffort: options?.bestEffort,
        readRevision: () => revisionRef.current,
        flush,
        reload,
        setStatus,
        setError,
      }),
    [
      canvasId,
      flush,
      hydratedCanvasId,
      metadata?.preset,
      project,
      reload,
      revision,
      revisionRef,
      setError,
      setStatus,
    ],
  );

  return { restoreMainlineDefault };
}
