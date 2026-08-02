// Copyright (c) 2026 AI anime
import { useMemo, useSyncExternalStore } from "react";

import {
  filterCanvasImageModels,
  type CanvasImageMode,
} from "../domain/imageModelCapability";
import {
  listCanvasImageModels,
  type CanvasGenerationCatalogGateway,
  type CanvasImageModel,
} from "../application/generationCatalog";
import { COMMERCIAL_MODEL_ACCESS_CHANGED_EVENT } from "@/modules/model_usage/public";

export interface UseCanvasImageModelsResult {
  models: CanvasImageModel[];
  isLoading: boolean;
  error: Error | null;
}

// Module-level shared store. One state snapshot per project, one fetch per
// project per tab lifetime. Every consumer reads the same reference via
// useSyncExternalStore, so a freshly mounted picker sees the cached result
// immediately (no per-component re-fetch, no loading flicker).
export function createCanvasImageModelHooks(
  gateway: CanvasGenerationCatalogGateway,
) {
  const states = new Map<string, UseCanvasImageModelsResult>();
  const listeners = new Map<string, Set<() => void>>();
  let accessChangeListenerInstalled = false;

  let noProjectStateMemo: UseCanvasImageModelsResult | null = null;
  const NO_MODELS: CanvasImageModel[] = [];

  function getNoProjectState(): UseCanvasImageModelsResult {
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

  function writeState(project: string, next: UseCanvasImageModelsResult) {
    states.set(project, next);
    emit(project);
  }

  function ensureLoaded(project: string) {
    // Already loaded or in-flight — `states` is populated synchronously on
    // first call so this is a true idempotent guard.
    if (states.has(project)) return;
    states.set(project, {
      models: NO_MODELS,
      isLoading: true,
      error: null,
    });
    listCanvasImageModels(project, gateway)
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
          "[creative-canvas] image models fetch failed:",
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
   * Trigger the shared model fetch eagerly for a project. Idempotent — safe
   * to call from the Canvas shell's root-level effect so the
   * request is in-flight before any picker / panel mounts. Subsequent picker
   * renders read straight from the populated store.
   */
  function prefetchCanvasImageModels(project: string): void {
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
   * Read the image model list from a shared module-level store.
   *
   * The first call for a given `project` triggers
   * authenticated commercial model catalog. All subsequent consumers read the
   * same cached snapshot and re-render together when the fetch resolves. An
   * empty or failed catalog remains empty so generation cannot submit a model
   * that was not authorized by the active Cloud/BYOK access mode.
   *
   * To force a refresh, reload the page — there is no manual invalidation.
   */
  function useCanvasImageModels(
    project: string | null,
    mode?: CanvasImageMode,
  ): UseCanvasImageModelsResult {
    installAccessChangeListener();

    // Kick off the shared fetch on first read. Idempotent thereafter.
    if (project) ensureLoaded(project);

    const snapshot = useSyncExternalStore(
      (callback) => subscribe(project ?? null, callback),
      () =>
        project ? states.get(project) ?? getNoProjectState() : getNoProjectState(),
      () => getNoProjectState(),
    );
    return useMemo(
      () =>
        mode
          ? { ...snapshot, models: filterCanvasImageModels(snapshot.models, mode) }
          : snapshot,
      [mode, snapshot],
    );
  }

  return { prefetchCanvasImageModels, useCanvasImageModels };
}
