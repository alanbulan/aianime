// Copyright (c) 2026 AI anime
import { useSyncExternalStore } from "react";

import type { CanvasCameraOptions } from "@/features/canvas/application/generationCatalog";
import { loadCanvasCameraOptions } from "@/features/canvas/catalogComposition";
import { readUrl } from "@/lib/url-params";

export interface UseFreezoneCameraOptionsResult {
  options: CanvasCameraOptions | null;
  isLoading: boolean;
  error: Error | null;
}

const EMPTY: UseFreezoneCameraOptionsResult = {
  options: null,
  isLoading: false,
  error: null,
};

// Per-project shared store. Mirrors useFreezoneImageModels — single fetch per
// project per tab lifetime, every consumer reads the same reference.
const states = new Map<string, UseFreezoneCameraOptionsResult>();
const listeners = new Map<string, Set<() => void>>();

function emit(project: string) {
  listeners.get(project)?.forEach((fn) => fn());
}

function writeState(project: string, next: UseFreezoneCameraOptionsResult) {
  states.set(project, next);
  emit(project);
}

function ensureLoaded(project: string) {
  if (states.has(project)) return;
  states.set(project, { options: null, isLoading: true, error: null });
  loadCanvasCameraOptions(project)
    .then((options) => {
      writeState(project, { options, isLoading: false, error: null });
    })
    .catch((error: unknown) => {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      console.warn(
        "[freezone] camera-options fetch failed:",
        normalized.message,
      );
      writeState(project, { options: null, isLoading: false, error: normalized });
    });
}

export function prefetchFreezoneCameraOptions(project: string): void {
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

export function useFreezoneCameraOptions(
  projectOverride?: string | null,
): UseFreezoneCameraOptionsResult {
  const project =
    projectOverride !== undefined ? projectOverride : readUrl().project;

  if (project) ensureLoaded(project);

  return useSyncExternalStore(
    (callback) => subscribe(project ?? null, callback),
    () => (project ? states.get(project) ?? EMPTY : EMPTY),
    () => EMPTY,
  );
}
