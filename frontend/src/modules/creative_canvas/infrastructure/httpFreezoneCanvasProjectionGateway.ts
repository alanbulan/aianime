// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";
import type {
  FreezoneProjectionBuildResponse,
  FreezoneProjectionStatusResponse,
} from "@/modules/creative_canvas/domain/canvasProjection";

import type {
  FreezoneCanvasProjectionGateway,
} from "../application/canvasProjection";

export const httpFreezoneCanvasProjectionGateway:
  FreezoneCanvasProjectionGateway = {
  async buildProjection(params) {
    return await apiCall<FreezoneProjectionBuildResponse>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/projections:build-from-preset`,
      { method: "POST", json: params.payload },
    );
  },

  async getStatuses(params) {
    return await apiCall<FreezoneProjectionStatusResponse>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/canvases/${encodeURIComponent(params.canvasId)}/projections:status`,
      {
        method: "POST",
        json: { projection_keys: params.projectionKeys ?? null },
      },
    );
  },
};
