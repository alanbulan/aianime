// Copyright (c) 2026 AI anime
import { useEffect, useState } from "react";

import { useCanvasStore } from "@/features/canvas/canvasStore";
import { prefetchFreezoneCameraOptions } from "@/features/canvas/hooks/useFreezoneCameraOptions";
import { prefetchFreezoneImageModels } from "@/features/canvas/hooks/useFreezoneImageModels";
import { prefetchFreezoneStyleTemplates } from "@/features/canvas/hooks/useFreezoneStyleTemplates";
import { prefetchFreezoneVideoCameraTemplates } from "@/features/canvas/hooks/useFreezoneVideoCameraTemplates";
import { prefetchFreezoneVideoModels } from "@/features/canvas/hooks/useFreezoneVideoModels";
import { currentCanvasParam } from "@/lib/app-router";
import { rememberLastCanvas, writeUrl } from "@/lib/url-params";
import type { CanvasSyncStatus } from "@/modules/creative_canvas/public";


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

const canvasKey = (projectId: string, canvasId: string) => `${projectId}::${canvasId}`;

/** The last canvas actually rendered in this page runtime. */
let lastRenderedCanvasKey: string | null = null;

export function useFreezoneCanvasEntryLifecycle({
  projectId,
  canvasId,
  hydratedCanvasId,
  syncStatus,
}: FreezoneCanvasEntryLifecycleOptions): FreezoneCanvasEntryState {
  // Keep the existing Store content visible while the same canvas rehydrates.
  const [hasRenderedCanvas, setHasRenderedCanvas] = useState(
    () =>
      lastRenderedCanvasKey === canvasKey(projectId, canvasId) &&
      useCanvasStore.getState().nodes.length > 0,
  );

  useEffect(() => {
    prefetchFreezoneImageModels(projectId);
    prefetchFreezoneVideoModels(projectId);
    prefetchFreezoneCameraOptions(projectId);
    prefetchFreezoneStyleTemplates(projectId);
    prefetchFreezoneVideoCameraTemplates(projectId);
  }, [projectId]);

  useEffect(() => {
    rememberLastCanvas(projectId, canvasId);
    if (canvasId !== "default" && currentCanvasParam() !== canvasId) {
      writeUrl({ canvas: canvasId }, { replace: true, notify: false });
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
}
