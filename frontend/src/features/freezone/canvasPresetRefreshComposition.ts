// Copyright (c) 2026 AI anime
import { createCanvasFromPreset } from "@/features/canvas/composition";

import { createCanvasPresetRefresher } from "./application/canvasPresetRefresh";

export const refreshCanvasPreset = createCanvasPresetRefresher({
  createCanvasFromPreset,
});
