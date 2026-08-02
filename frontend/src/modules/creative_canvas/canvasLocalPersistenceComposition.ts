// Copyright (c) 2026 AI anime
import { canvasContentSignature } from "./application/canvasSyncHydration";
import { canvasSyncStorageGateway } from "./canvasSyncComposition";
import { createCanvasLocalPersistenceHooks } from "./presentation/useCanvasLocalPersistence";

export const {
  useCanvasHistoryPersistence,
  useCanvasViewportPersistence,
} = createCanvasLocalPersistenceHooks({
  storage: canvasSyncStorageGateway,
  contentSignature: canvasContentSignature,
  schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancelScheduled: (handle) => window.clearTimeout(handle as number),
  addBeforeUnload: (listener) =>
    window.addEventListener("beforeunload", listener),
  removeBeforeUnload: (listener) =>
    window.removeEventListener("beforeunload", listener),
});
