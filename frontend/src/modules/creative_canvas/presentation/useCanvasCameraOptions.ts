// Copyright (c) 2026 AI anime
import { useSyncExternalStore } from "react";

import {
  getCanvasCameraOptions,
  type CanvasCameraOptions,
  type CanvasGenerationCatalogGateway,
} from "../application/generationCatalog";

export interface UseCanvasCameraOptionsResult {
  options: CanvasCameraOptions | null;
  isLoading: boolean;
  error: Error | null;
}

export function createCanvasCameraOptionsHooks(
  gateway: CanvasGenerationCatalogGateway,
) {
  const EMPTY: UseCanvasCameraOptionsResult = {
    options: null,
    isLoading: false,
    error: null,
  };

  // Per-project shared store. Mirrors the model catalogs: one fetch per
  // project per tab lifetime, every consumer reads the same reference.
  const states = new Map<string, UseCanvasCameraOptionsResult>();
  const listeners = new Map<string, Set<() => void>>();

  function emit(project: string) {
    listeners.get(project)?.forEach((fn) => fn());
  }

  function writeState(project: string, next: UseCanvasCameraOptionsResult) {
    states.set(project, next);
    emit(project);
  }

  function ensureLoaded(project: string) {
    if (states.has(project)) return;
    states.set(project, { options: null, isLoading: true, error: null });
    getCanvasCameraOptions(project, gateway)
      .then((options) => {
        writeState(project, { options, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        console.warn(
          "[creative-canvas] camera-options fetch failed:",
          normalized.message,
        );
        writeState(project, { options: null, isLoading: false, error: normalized });
      });
  }

  function prefetchCanvasCameraOptions(project: string): void {
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

  function useCanvasCameraOptions(
    project: string | null,
  ): UseCanvasCameraOptionsResult {
    if (project) ensureLoaded(project);

    return useSyncExternalStore(
      (callback) => subscribe(project ?? null, callback),
      () => (project ? states.get(project) ?? EMPTY : EMPTY),
      () => EMPTY,
    );
  }

  return { prefetchCanvasCameraOptions, useCanvasCameraOptions };
}
