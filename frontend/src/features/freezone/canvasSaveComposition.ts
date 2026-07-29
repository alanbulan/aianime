// Copyright (c) 2026 AI anime
import { useCanvasStore } from "@/features/canvas/canvasStore";
import {
  generateClientSaveId,
  putFreezoneCanvas,
} from "@/features/canvas/composition";

import { createCanvasSaveScheduler } from "./application/canvasSave";
import { canvasDraftStorageGateway } from "./canvasDraftComposition";

export const scheduleCanvasSave = createCanvasSaveScheduler({
  readCanvasState: () => {
    const state = useCanvasStore.getState();
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
  acknowledgePendingClear: () =>
    useCanvasStore.getState().acknowledgePendingClear(),
  sleep: (delayMs) =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, delayMs);
    }),
  warn: (message) => console.warn(message),
});
