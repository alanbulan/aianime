// Copyright (c) 2026 AI anime
import { useSyncExternalStore } from "react";

import {
  listCanvasVideoModels,
  type CanvasGenerationCatalogGateway,
  type CanvasVideoModel,
} from "../application/generationCatalog";
import { COMMERCIAL_MODEL_ACCESS_CHANGED_EVENT } from "@/modules/model_usage/public";

export interface UseCanvasVideoModelsResult {
  models: CanvasVideoModel[];
  isLoading: boolean;
  error: Error | null;
}

// Module-level shared store, keyed separately from image catalogs so
// a separate namespace so image and video fetches don't collide. One fetch
// per project per tab lifetime.
export function createCanvasVideoModelHooks(
  gateway: CanvasGenerationCatalogGateway,
) {
  const states = new Map<string, UseCanvasVideoModelsResult>();
  const listeners = new Map<string, Set<() => void>>();
  let accessChangeListenerInstalled = false;

  let noProjectStateMemo: UseCanvasVideoModelsResult | null = null;
  const NO_MODELS: CanvasVideoModel[] = [];

  function getNoProjectState(): UseCanvasVideoModelsResult {
    if (!noProjectStateMemo) {
      noProjectStateMemo = {
        models: NO_MODELS,
        isLoading: false,
        error: null,
      };
    }
    return noProjectStateMemo;
  }

  function emit(project: string) {
    listeners.get(project)?.forEach((fn) => fn());
  }

  function installAccessChangeListener() {
    if (accessChangeListenerInstalled || typeof window === "undefined") return;
    accessChangeListenerInstalled = true;
    window.addEventListener(COMMERCIAL_MODEL_ACCESS_CHANGED_EVENT, () => {
      const projects = [...states.keys()];
      states.clear();
      noProjectStateMemo = null;
      projects.forEach(emit);
    });
  }

  function writeState(project: string, next: UseCanvasVideoModelsResult) {
    states.set(project, next);
    emit(project);
  }

  function ensureLoaded(project: string) {
    if (states.has(project)) return;
    states.set(project, {
      models: NO_MODELS,
      isLoading: true,
      error: null,
    });
    listCanvasVideoModels(project, gateway)
      .then((models) => {
        writeState(project, {
          models,
          isLoading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        console.warn(
          "[creative-canvas] video models fetch failed:",
          normalized.message,
        );
        writeState(project, {
          models: NO_MODELS,
          isLoading: false,
          error: normalized,
        });
      });
  }

  /**
   * Trigger the shared video-model fetch eagerly for a project. Idempotent —
   * safe to call from the Canvas shell alongside the image-model prefetch.
   */
  function prefetchCanvasVideoModels(project: string): void {
    if (!project) return;
    installAccessChangeListener();
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

  /**
   * Read the video model list from a shared module-level store.
   *
   * Reads the entitlement-filtered commercial VIDEO catalog. There is no local
   * static fallback because the catalog is the authority for both cloud and BYOK.
   */
  function useCanvasVideoModels(
    project: string | null,
  ): UseCanvasVideoModelsResult {
    installAccessChangeListener();

    if (project) ensureLoaded(project);

    return useSyncExternalStore(
      (callback) => subscribe(project ?? null, callback),
      () =>
        project ? states.get(project) ?? getNoProjectState() : getNoProjectState(),
      () => getNoProjectState(),
    );
  }

  return { prefetchCanvasVideoModels, useCanvasVideoModels };
}
