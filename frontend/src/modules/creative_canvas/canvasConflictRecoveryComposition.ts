// Copyright (c) 2026 AI anime
import { createCanvasConflictRecovery } from "./application/canvasConflictRecovery";
import { buildConflictCopyCanvasId } from "./application/canvasSyncStorage";
import { canvasDraftStorageGateway } from "./canvasDraftComposition";
import { generateClientSaveId, putFreezoneCanvas } from "./canvasStorageComposition";
import { canvasSyncStorageGateway } from "./canvasSyncComposition";
import { createUseCanvasConflictController } from "./presentation/useCanvasConflictController";
import { shotMetadataState } from "./shotMetadataComposition";

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

export const useCanvasConflictController = createUseCanvasConflictController({
  recovery: canvasConflictRecovery,
  readShotMetadata: () => shotMetadataState.getShot(),
});
