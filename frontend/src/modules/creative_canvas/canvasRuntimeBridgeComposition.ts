// Copyright (c) 2026 AI anime
import {
  mergeProjectionMetadata,
  removeProjectionMetadata,
} from "./domain/canvasProjectionMetadata";
import {
  mergeProjectedCanvasWithLocalCanvas,
  removeProjectionFromLocalCanvas,
  type CanvasProjectionEdge,
  type CanvasProjectionNode,
} from "./application/canvasProjectionGraph";
import { registerFreezoneCanvasRuntime } from "./application/canvasRuntimeState";
import { canvasContentSignature } from "./application/canvasSyncHydration";
import { canvasEnvelopeFromRemote } from "./application/canvasSyncCore";
import { setFreezoneCanvasMetadata } from "./application/canvasMetadataState";
import { EMPTY_SHOT_METADATA } from "./domain/shotMetadata";
import {
  createUseCanvasRuntimeBridge,
  type CanvasRuntimeBridgeStore,
} from "./presentation/useCanvasRuntimeBridge";
import { shotMetadataState } from "./shotMetadataComposition";

export function createCanvasRuntimeBridgeHook<
  TNode extends CanvasProjectionNode,
  TEdge extends CanvasProjectionEdge,
>(store: CanvasRuntimeBridgeStore<TNode, TEdge>) {
  return createUseCanvasRuntimeBridge({
    store,
    registerRuntime: (
      project,
      canvasId,
      apply,
      flush,
      applyProjection,
      removeProjection,
    ) =>
      registerFreezoneCanvasRuntime<TNode, TEdge>(
        project,
        canvasId,
        apply,
        flush,
        applyProjection,
        removeProjection,
      ),
    contentSignature: canvasContentSignature,
    envelopeFromRemote: canvasEnvelopeFromRemote,
    mergeProjectionGraph: mergeProjectedCanvasWithLocalCanvas,
    removeProjectionGraph: removeProjectionFromLocalCanvas,
    mergeProjectionMetadata,
    removeProjectionMetadata,
    publishCanvasMetadata: setFreezoneCanvasMetadata,
    hydrateShotMetadata: (metadata) => shotMetadataState.hydrate(metadata),
    emptyShotMetadata: EMPTY_SHOT_METADATA,
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  });
}
