// Copyright (c) 2026 AI anime
import { useEffect, useState } from "react";

import type { CanvasSyncStatus } from "../application/canvasSyncStorage";

export interface FreezoneCanvasEntryLifecycleOptions {
  projectId: string;
  canvasId: string;
  hydratedCanvasId: string | null;
  syncStatus: CanvasSyncStatus;
}

export interface FreezoneCanvasEntryState {
  showBlockingLoading: boolean;
  showLoadingOverlay: boolean;
}

export interface FreezoneCanvasEntryLifecycleDependencies {
  readCanvasNodeCount(): number;
  prefetchImageModels(projectId: string): void;
  prefetchVideoModels(projectId: string): void;
  prefetchCameraOptions(projectId: string): void;
  prefetchStyleTemplates(projectId: string): void;
  prefetchVideoCameraTemplates(projectId: string): void;
  readCurrentCanvasParam(): string | null;
  rememberLastCanvas(projectId: string, canvasId: string): void;
  replaceCanvasParam(canvasId: string): void;
}

const canvasKey = (projectId: string, canvasId: string) =>
  `${projectId}::${canvasId}`;

export function createUseFreezoneCanvasEntryLifecycle({
  readCanvasNodeCount,
  prefetchImageModels,
  prefetchVideoModels,
  prefetchCameraOptions,
  prefetchStyleTemplates,
  prefetchVideoCameraTemplates,
  readCurrentCanvasParam,
  rememberLastCanvas,
  replaceCanvasParam,
}: FreezoneCanvasEntryLifecycleDependencies) {
  let lastRenderedCanvasKey: string | null = null;

  return function useFreezoneCanvasEntryLifecycle({
    projectId,
    canvasId,
    hydratedCanvasId,
    syncStatus,
  }: FreezoneCanvasEntryLifecycleOptions): FreezoneCanvasEntryState {
    const [hasRenderedCanvas, setHasRenderedCanvas] = useState(
      () =>
        lastRenderedCanvasKey === canvasKey(projectId, canvasId) &&
        readCanvasNodeCount() > 0,
    );

    useEffect(() => {
      prefetchImageModels(projectId);
      prefetchVideoModels(projectId);
      prefetchCameraOptions(projectId);
      prefetchStyleTemplates(projectId);
      prefetchVideoCameraTemplates(projectId);
    }, [projectId]);

    useEffect(() => {
      rememberLastCanvas(projectId, canvasId);
      if (canvasId !== "default" && readCurrentCanvasParam() !== canvasId) {
        replaceCanvasParam(canvasId);
      }
    }, [canvasId, projectId]);

    useEffect(() => {
      if (syncStatus === "ready" && hydratedCanvasId === canvasId) {
        lastRenderedCanvasKey = canvasKey(projectId, canvasId);
        setHasRenderedCanvas(true);
      }
    }, [canvasId, hydratedCanvasId, projectId, syncStatus]);

    return {
      showBlockingLoading: syncStatus === "loading" && !hasRenderedCanvas,
      showLoadingOverlay: syncStatus === "loading" && hasRenderedCanvas,
    };
  };
}
