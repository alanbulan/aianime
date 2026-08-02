// Copyright (c) 2026 AI anime
import { createCanvasSaveScheduler } from "./application/canvasSave";
import { createCanvasUnloadSaver } from "./application/canvasUnloadSave";
import type {
  CanvasHydrationEdge,
  CanvasHydrationNode,
} from "./application/canvasSyncHydration";
import { canvasContentSignature } from "./application/canvasSyncHydration";
import { canvasConflictRecovery } from "./canvasConflictRecoveryComposition";
import { canvasDraftStorageGateway } from "./canvasDraftComposition";
import {
  generateClientSaveId,
  putFreezoneCanvas,
  putFreezoneCanvasKeepalive,
} from "./canvasStorageComposition";
import { canvasSyncStorageGateway } from "./canvasSyncComposition";
import {
  createUseCanvasSaveController,
  type CanvasSaveControllerStore,
} from "./presentation/useCanvasSaveController";
import { shotMetadataState } from "./shotMetadataComposition";

export function createCanvasSaveControllerHook<
  TNode extends CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge,
>(store: CanvasSaveControllerStore<TNode, TEdge>) {
  const scheduleCanvasSave = createCanvasSaveScheduler({
    readCanvasState: () => {
      const state = store.read();
      return {
        nodeCount: state.nodes.length,
        edgeCount: state.edges.length,
        userEditsSinceHydrate: state.userEditsSinceHydrate,
        lastMutationSource: state.lastMutationSource,
        pendingClearIntent: state.pendingClearIntent,
      };
    },
    generateClientSaveId,
    saveCanvas: putFreezoneCanvas,
    clearDraft: (project, canvasId) =>
      canvasDraftStorageGateway.clearDraft(project, canvasId),
    acknowledgePendingClear: () => store.acknowledgePendingClear(),
    sleep: (delayMs) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, delayMs);
      }),
    warn: (message) => console.warn(message),
    captureConflict: (args) => canvasConflictRecovery.capture(args),
  });
  const saveCanvasBeforeUnload = createCanvasUnloadSaver({
    generateClientSaveId,
    persistViewport: (project, canvasId, viewport) =>
      canvasSyncStorageGateway.writeViewport(project, canvasId, viewport),
    saveCanvasKeepalive: putFreezoneCanvasKeepalive,
  });

  return createUseCanvasSaveController({
    store,
    scheduleCanvasSave,
    saveCanvasBeforeUnload,
    contentSignature: canvasContentSignature,
    readShotMetadata: () => shotMetadataState.getShot(),
    subscribeShotMetadata: (listener) => shotMetadataState.subscribe(listener),
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelScheduled: (handle) => window.clearTimeout(handle as number),
  });
}
