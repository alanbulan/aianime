// Copyright (c) 2026 AI anime
import { createCanvasPresetRefresher } from "./application/canvasPresetRefresh";
import { createCanvasFromPreset } from "./canvasStorageComposition";
import { createUseCanvasPresetRefreshController } from "./presentation/useCanvasPresetRefreshController";

const refreshCanvasPreset = createCanvasPresetRefresher({
  createCanvasFromPreset,
});

export const useCanvasPresetRefreshController =
  createUseCanvasPresetRefreshController(refreshCanvasPreset);
