// Copyright (c) 2026 AI anime
import { createCanvasHydrateFlightCoordinator } from "./application/canvasHydrateFlights";
import { setFreezoneCanvasMetadata } from "./application/canvasMetadataState";
import { consumeQueuedLocalFreezoneProjections } from "./application/canvasRuntimeState";
import type {
  CanvasHydrationEdge,
  CanvasHydrationNode,
} from "./application/canvasSyncHydration";
import type { FreezoneCanvasPayload } from "./domain/canvasStorage";
import { canvasConflictRecovery } from "./canvasConflictRecoveryComposition";
import { scheduleCanvasDraftPruneOnce } from "./canvasStorageRetentionComposition";
import { canvasSyncStorageGateway } from "./canvasSyncComposition";
import {
  createUseCanvasHydrationLifecycle,
  type CanvasHydrationLifecycleStore,
} from "./presentation/useCanvasHydrationLifecycle";
import { shotMetadataState } from "./shotMetadataComposition";

export interface CanvasHydrationLifecycleCompositionOptions {
  loadCanvas(
    project: string,
    canvasId: string,
    signal: AbortSignal,
  ): Promise<FreezoneCanvasPayload>;
}

export function createCanvasHydrationLifecycleHook<
  TNode extends CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge,
>(
  store: CanvasHydrationLifecycleStore<TNode, TEdge>,
  options: CanvasHydrationLifecycleCompositionOptions,
) {
  const hydrateFlights = createCanvasHydrateFlightCoordinator({
    loadCanvas: options.loadCanvas,
    hasLocalEdits: () => store.read().userEditsSinceHydrate > 0,
    now: () => Date.now(),
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelScheduled: (handle) => window.clearTimeout(handle as number),
  });

  return createUseCanvasHydrationLifecycle({
    store,
    hydrateFlights,
    syncStorage: canvasSyncStorageGateway,
    conflictRecovery: canvasConflictRecovery,
    scheduleDraftPrune: scheduleCanvasDraftPruneOnce,
    publishCanvasMetadata: setFreezoneCanvasMetadata,
    shotMetadataState,
    consumeQueuedProjections: consumeQueuedLocalFreezoneProjections,
    scheduleFrame: (callback) => window.requestAnimationFrame(callback),
  });
}
