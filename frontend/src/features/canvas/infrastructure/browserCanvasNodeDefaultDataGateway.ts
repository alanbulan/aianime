// Copyright (c) 2026 AI anime
;


import type { CanvasNodeData, CanvasNodeDefaultDataGateway } from "@/modules/creative_canvas/public";
const LAST_VIDEO_MODEL_STORAGE_KEY = "canvas.lastVideoModel";
// 旧边界基础设施：与模块 CANVAS_CONNECTION_NODE_TYPES.video 保持同一字面量。
const VIDEO_NODE_TYPE = "videoNode" as const;

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
    if (type !== VIDEO_NODE_TYPE) return {};
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
