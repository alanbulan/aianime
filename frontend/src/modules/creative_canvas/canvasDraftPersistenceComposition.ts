// Copyright (c) 2026 AI anime
import { canvasDraftStorageGateway } from "./canvasDraftComposition";
import { createUseCanvasDraftPersistenceController } from "./presentation/useCanvasDraftPersistenceController";
import { shotMetadataState } from "./shotMetadataComposition";

export const useCanvasDraftPersistenceController =
  createUseCanvasDraftPersistenceController({
    storage: canvasDraftStorageGateway,
    readShotMetadata: () => shotMetadataState.getShot(),
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelScheduled: (handle) => window.clearTimeout(handle as number),
    now: () => Date.now(),
  });
