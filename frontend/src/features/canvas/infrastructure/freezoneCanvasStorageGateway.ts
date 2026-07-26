// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type {
  FreezoneCanvasStorageGateway,
} from "../application/freezoneCanvasStorage";
import type {
  FreezoneCanvasHistoryEntry,
  FreezoneCanvasPayload,
  FreezoneCanvasSaveResult,
  FreezoneCanvasSummary,
  FreezonePresetCanvasResponse,
} from "@/features/freezone/public";

export const freezoneCanvasStorageGateway: FreezoneCanvasStorageGateway = {
  async listCanvases(params) {
    return await apiCall<FreezoneCanvasSummary[]>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/canvases`,
      params.signal ? { signal: params.signal } : undefined,
    );
  },

  async getCanvas(params) {
    return await apiCall<FreezoneCanvasPayload>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/canvases/${encodeURIComponent(params.canvasId)}`,
      params.signal ? { signal: params.signal } : undefined,
    );
  },

  async saveCanvas(params) {
    return await apiCall<FreezoneCanvasSaveResult>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/canvases/${encodeURIComponent(params.canvasId)}`,
      { method: "PUT", json: params.payload },
    );
  },

  async createFromPreset(params) {
    return await apiCall<FreezonePresetCanvasResponse>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/canvases:from-preset`,
      { method: "POST", json: params.payload },
    );
  },

  async deleteCanvas(params) {
    return await apiCall<{ deleted: boolean }>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/canvases/${encodeURIComponent(params.canvasId)}`,
      { method: "DELETE" },
    );
  },

  async listHistory(params) {
    return await apiCall<FreezoneCanvasHistoryEntry[]>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/canvases/${encodeURIComponent(params.canvasId)}/history`,
    );
  },

  async restoreVersion(params) {
    return await apiCall<FreezoneCanvasSaveResult>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/canvases/${encodeURIComponent(params.canvasId)}/restore`,
      { method: "POST", json: params.payload },
    );
  },
};
