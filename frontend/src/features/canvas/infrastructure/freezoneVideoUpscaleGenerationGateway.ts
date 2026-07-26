// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasVideoUpscaleGenerationGateway } from "../application/generateCanvasVideoUpscale";
import type { CanvasGenerationTaskRef } from "../application/ports";

export const freezoneVideoUpscaleGenerationGateway: CanvasVideoUpscaleGenerationGateway = {
  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/video/upscale`,
      {
        method: "POST",
        json: {
          source_url: command.sourceUrl,
          resolution: command.resolution,
          frame_interpolation: command.frameInterpolation,
          denoise_strength: command.denoiseStrength,
          ...(command.canvasId ? { canvas_id: command.canvasId } : {}),
          ...(command.nodeId ? { node_id: command.nodeId } : {}),
        },
      },
    );
  },
};
