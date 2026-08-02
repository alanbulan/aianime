// Copyright (c) 2026 AI anime
import { useSyncExternalStore } from "react";

import type { CanvasVideoModel } from "@/features/canvas/application/generationCatalog";
import { loadCanvasVideoModels } from "@/features/canvas/catalogComposition";
import type { ModelOption } from "@/features/canvas/ui/ProviderModelPicker";
import { COMMERCIAL_MODEL_ACCESS_CHANGED_EVENT } from "@/modules/model_usage/public";

export interface UseFreezoneVideoModelsResult {
  models: ModelOption[];
  isLoading: boolean;
  error: Error | null;
}

// Module-level shared store, mirrors useFreezoneImageModels but keyed under
// a separate namespace so image and video fetches don't collide. One fetch
// per project per tab lifetime.
const states = new Map<string, UseFreezoneVideoModelsResult>();
const listeners = new Map<string, Set<() => void>>();
let accessChangeListenerInstalled = false;

let noProjectStateMemo: UseFreezoneVideoModelsResult | null = null;
const NO_MODELS: ModelOption[] = [];

function getNoProjectState(): UseFreezoneVideoModelsResult {
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

function writeState(project: string, next: UseFreezoneVideoModelsResult) {
  states.set(project, next);
  emit(project);
}

function toModelOptions(models: CanvasVideoModel[]): ModelOption[] {
  return models;
}

function ensureLoaded(project: string) {
  if (states.has(project)) return;
  states.set(project, {
    models: NO_MODELS,
    isLoading: true,
    error: null,
  });
  loadCanvasVideoModels(project)
    .then((models) => {
      writeState(project, {
        models: toModelOptions(models),
        isLoading: false,
        error: null,
      });
    })
    .catch((error: unknown) => {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      console.warn(
        "[freezone] video models fetch failed:",
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
 * safe to call from FreezoneShell mount alongside the image-model prefetch.
 */
export function prefetchFreezoneVideoModels(project: string): void {
  if (!project) return;
  installAccessChangeListener();
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

/**
 * Read the video model list from a shared module-level store.
 *
 * Reads the entitlement-filtered commercial VIDEO catalog. There is no local
 * static fallback because the catalog is the authority for both cloud and BYOK.
 */
export function useFreezoneVideoModels(
  project: string | null,
): UseFreezoneVideoModelsResult {
  installAccessChangeListener();

  if (project) ensureLoaded(project);

  return useSyncExternalStore(
    (callback) => subscribe(project ?? null, callback),
    () =>
      project ? states.get(project) ?? getNoProjectState() : getNoProjectState(),
    () => getNoProjectState(),
  );
}
