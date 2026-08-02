// Copyright (c) 2026 AI anime
import { useSyncExternalStore } from "react";

import { loadCanvasVideoCameraTemplates } from "@/features/canvas/catalogComposition";
import type { CameraMovementPreset } from "@/features/canvas/domain/cameraMovementPresets";

export interface UseFreezoneVideoCameraTemplatesResult {
  templates: CameraMovementPreset[];
  isLoading: boolean;
  error: Error | null;
}

const EMPTY: UseFreezoneVideoCameraTemplatesResult = {
  templates: [],
  isLoading: false,
  error: null,
};

// Per-project shared store, mirrors useFreezoneCameraOptions.
const states = new Map<string, UseFreezoneVideoCameraTemplatesResult>();
const listeners = new Map<string, Set<() => void>>();

function emit(project: string) {
  listeners.get(project)?.forEach((fn) => fn());
}

function writeState(project: string, next: UseFreezoneVideoCameraTemplatesResult) {
  states.set(project, next);
  emit(project);
}

function ensureLoaded(project: string) {
  if (states.has(project)) return;
  states.set(project, { templates: [], isLoading: true, error: null });
  loadCanvasVideoCameraTemplates(project)
    .then((templates) => {
      writeState(project, { templates, isLoading: false, error: null });
    })
    .catch((error: unknown) => {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      console.warn(
        "[freezone] video/camera-templates fetch failed:",
        normalized.message,
      );
      writeState(project, { templates: [], isLoading: false, error: normalized });
    });
}

export function prefetchFreezoneVideoCameraTemplates(project: string): void {
  if (!project) return;
  ensureLoaded(project);
}

function subscribe(project: string | null, callback: () => void) {
  if (!project) return () => {};
  let bucket = listeners.get(project);
  if (!bucket) {
    bucket = new Set();
    listeners.set(project, bucket);
  }
  bucket.add(callback);
  return () => {
    bucket!.delete(callback);
    if (bucket!.size === 0) listeners.delete(project);
  };
}

export function useFreezoneVideoCameraTemplates(
  project: string | null,
): UseFreezoneVideoCameraTemplatesResult {
  if (project) ensureLoaded(project);

  return useSyncExternalStore(
    (callback) => subscribe(project ?? null, callback),
    () => (project ? states.get(project) ?? EMPTY : EMPTY),
    () => EMPTY,
  );
}
