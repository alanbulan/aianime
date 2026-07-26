// Copyright (c) 2026 AI anime
import { submitFreezoneVideoUpscale } from "@/api/ops";

import type { CanvasVideoUpscaleGenerationGateway } from "../application/generateCanvasVideoUpscale";

export const freezoneVideoUpscaleGenerationGateway: CanvasVideoUpscaleGenerationGateway = {
  async submit(projectId, command) {
    return await submitFreezoneVideoUpscale(projectId, {
      sourceUrl: command.sourceUrl,
      resolution: command.resolution,
      frameInterpolation: command.frameInterpolation,
      denoiseStrength: command.denoiseStrength,
      canvasId: command.canvasId,
      nodeId: command.nodeId,
    });
  },
};
