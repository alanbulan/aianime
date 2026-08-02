// Copyright (c) 2026 AI anime
import { useCallback } from "react";

import type { CanvasPresetRefreshArgs } from "../application/canvasPresetRefresh";
import type { CanvasSyncStatus } from "../application/canvasSyncStorage";

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
  readUserEditsSinceHydrate(): number;
  flush(): Promise<boolean>;
  reload(): void;
  setStatus(status: CanvasSyncStatus): void;
  setError(error: string | null): void;
}

export interface CanvasPresetRefreshController {
  restoreMainlineDefault(options?: { bestEffort?: boolean }): Promise<string>;
}

type CanvasPresetRefresher = (
  args: CanvasPresetRefreshArgs,
) => Promise<string>;

export function createUseCanvasPresetRefreshController(
  refreshCanvasPreset: CanvasPresetRefresher,
) {
  return function useCanvasPresetRefreshController({
    project,
    canvasId,
    metadata,
    revision,
    hydratedCanvasId,
    revisionRef,
    readUserEditsSinceHydrate,
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
          userEditsSinceHydrate: readUserEditsSinceHydrate(),
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
        readUserEditsSinceHydrate,
        reload,
        revision,
        revisionRef,
        setError,
        setStatus,
      ],
    );

    return { restoreMainlineDefault };
  };
}
