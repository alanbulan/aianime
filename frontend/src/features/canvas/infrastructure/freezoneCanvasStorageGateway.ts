// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type {
  FreezoneCanvasStorageGateway,
} from "../application/freezoneCanvasStorage";
import type {
  FreezoneCanvasPayload,
  FreezonePresetCanvasResponse,
} from "@/features/freezone/public";

export const freezoneCanvasStorageGateway: FreezoneCanvasStorageGateway = {
  async getCanvas(params) {
    return await apiCall<FreezoneCanvasPayload>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/canvases/${encodeURIComponent(params.canvasId)}`,
      params.signal ? { signal: params.signal } : undefined,
    );
  },

  async createFromPreset(params) {
    return await apiCall<FreezonePresetCanvasResponse>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/canvases:from-preset`,
      { method: "POST", json: params.payload },
    );
  },
};
