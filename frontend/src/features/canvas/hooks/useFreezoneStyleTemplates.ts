// Copyright (c) 2026 AI anime
import { useSyncExternalStore } from "react";

import type { CanvasStyleTemplate } from "@/features/canvas/application/generationCatalog";
import { loadCanvasStyleTemplates } from "@/features/canvas/catalogComposition";

export interface UseFreezoneStyleTemplatesResult {
  templates: CanvasStyleTemplate[];
  isLoading: boolean;
  error: Error | null;
}

const EMPTY: UseFreezoneStyleTemplatesResult = {
  templates: [],
  isLoading: false,
  error: null,
};

// Per-project shared store — mirrors useFreezoneImageModels /
// useFreezoneCameraOptions. One fetch per project per tab lifetime.
const states = new Map<string, UseFreezoneStyleTemplatesResult>();
const listeners = new Map<string, Set<() => void>>();

function emit(project: string) {
  listeners.get(project)?.forEach((fn) => fn());
}

function writeState(project: string, next: UseFreezoneStyleTemplatesResult) {
  states.set(project, next);
  emit(project);
}

function ensureLoaded(project: string) {
  if (states.has(project)) return;
  states.set(project, { templates: [], isLoading: true, error: null });
  loadCanvasStyleTemplates(project)
    .then((templates) => {
      writeState(project, { templates, isLoading: false, error: null });
    })
    .catch((error: unknown) => {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      console.warn(
        "[freezone] style-templates fetch failed:",
        normalized.message,
      );
      writeState(project, { templates: [], isLoading: false, error: normalized });
    });
}

export function prefetchFreezoneStyleTemplates(project: string): void {
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

export function useFreezoneStyleTemplates(
  project: string | null,
): UseFreezoneStyleTemplatesResult {
  if (project) ensureLoaded(project);

  return useSyncExternalStore(
    (callback) => subscribe(project ?? null, callback),
    () => (project ? states.get(project) ?? EMPTY : EMPTY),
    () => EMPTY,
  );
}
