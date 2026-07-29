// Copyright (c) 2026 AI anime
import {
  generateClientSaveId,
  putFreezoneCanvas,
} from "@/features/canvas/composition";

import { createCanvasConflictRecovery } from "./application/canvasConflictRecovery";
import { buildConflictCopyCanvasId } from "./application/canvasSyncStorage";
import { canvasDraftStorageGateway } from "./canvasDraftComposition";
import { canvasSyncStorageGateway } from "./canvasSyncComposition";

export const canvasConflictRecovery = createCanvasConflictRecovery({
  readConflictSnapshot: (canvasId) =>
    canvasSyncStorageGateway.readConflictSnapshot(canvasId),
  writeConflictSnapshot: (snapshot) =>
    canvasSyncStorageGateway.writeConflictSnapshot(snapshot),
  clearConflictSnapshot: (canvasId) =>
    canvasSyncStorageGateway.clearConflictSnapshot(canvasId),
  clearDraft: (project, canvasId) =>
    canvasDraftStorageGateway.clearDraft(project, canvasId),
  createCopyCanvasId: buildConflictCopyCanvasId,
  generateClientSaveId,
  saveCanvas: putFreezoneCanvas,
  nowIso: () => new Date().toISOString(),
});
