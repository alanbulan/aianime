// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type CanvasNodeData,
} from "../domain/canvasNodes";
import type { CanvasNodeDefaultDataGateway } from "../application/ports";

const LAST_VIDEO_MODEL_STORAGE_KEY = "canvas.lastVideoModel";

function readLastVideoModel(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(LAST_VIDEO_MODEL_STORAGE_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export const browserCanvasNodeDefaultDataGateway: CanvasNodeDefaultDataGateway = {
  getOverrides(type) {
    if (type !== CANVAS_NODE_TYPES.video) return {};
    const model = readLastVideoModel();
    return model ? ({ model } as Partial<CanvasNodeData>) : {};
  },
};

export function rememberLastVideoModel(modelId: string): void {
  if (typeof window === "undefined" || !modelId) return;
  try {
    window.localStorage.setItem(LAST_VIDEO_MODEL_STORAGE_KEY, modelId);
  } catch {
    // Browser storage may be unavailable in restricted contexts.
  }
}
