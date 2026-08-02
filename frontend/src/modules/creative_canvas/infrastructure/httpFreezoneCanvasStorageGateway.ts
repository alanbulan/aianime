// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type {
  FreezoneCanvasKeepaliveGateway,
  FreezoneCanvasStorageGateway,
} from "../application/canvasStorageOperations";
import type {
  FreezoneCanvasPayload,
  FreezoneCanvasSaveResult,
  FreezoneCanvasSummary,
  FreezonePresetCanvasResponse,
} from "../domain/canvasStorage";

export const httpFreezoneCanvasStorageGateway: FreezoneCanvasStorageGateway &
  FreezoneCanvasKeepaliveGateway = {
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

  saveCanvasKeepalive(params) {
    const url = `/api/v1/projects/${encodeURIComponent(params.projectId)}/freezone/canvases/${encodeURIComponent(params.canvasId)}`;
    void fetch(url, {
      method: "PUT",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.payload),
    }).catch(() => undefined);
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
};
