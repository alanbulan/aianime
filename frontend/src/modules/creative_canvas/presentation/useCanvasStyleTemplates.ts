// Copyright (c) 2026 AI anime
import { useSyncExternalStore } from "react";

import {
  listCanvasStyleTemplates,
  type CanvasGenerationCatalogGateway,
  type CanvasStyleTemplate,
} from "../application/generationCatalog";

export interface UseCanvasStyleTemplatesResult {
  templates: CanvasStyleTemplate[];
  isLoading: boolean;
  error: Error | null;
}

export function createCanvasStyleTemplateHooks(
  gateway: CanvasGenerationCatalogGateway,
) {
  const EMPTY: UseCanvasStyleTemplatesResult = {
    templates: [],
    isLoading: false,
    error: null,
  };

  // Per-project shared store. One fetch per project per tab lifetime.
  const states = new Map<string, UseCanvasStyleTemplatesResult>();
  const listeners = new Map<string, Set<() => void>>();

  function emit(project: string) {
    listeners.get(project)?.forEach((fn) => fn());
  }

  function writeState(project: string, next: UseCanvasStyleTemplatesResult) {
    states.set(project, next);
    emit(project);
  }

  function ensureLoaded(project: string) {
    if (states.has(project)) return;
    states.set(project, { templates: [], isLoading: true, error: null });
    listCanvasStyleTemplates(project, gateway)
      .then((templates) => {
        writeState(project, { templates, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        console.warn(
          "[creative-canvas] style-templates fetch failed:",
          normalized.message,
        );
        writeState(project, { templates: [], isLoading: false, error: normalized });
      });
  }

  function prefetchCanvasStyleTemplates(project: string): void {
    if (!project) return;
    ensureLoaded(project);
  }

  function subscribe(project: string | null, callback: () => void) {
    if (!project) return () => { };
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

  function useCanvasStyleTemplates(
    project: string | null,
  ): UseCanvasStyleTemplatesResult {
    if (project) ensureLoaded(project);

    return useSyncExternalStore(
      (callback) => subscribe(project ?? null, callback),
      () => (project ? states.get(project) ?? EMPTY : EMPTY),
      () => EMPTY,
    );
  }

  return { prefetchCanvasStyleTemplates, useCanvasStyleTemplates };
}
