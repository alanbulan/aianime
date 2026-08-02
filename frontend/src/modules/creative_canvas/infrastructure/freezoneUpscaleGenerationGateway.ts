// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasUpscaleGenerationGateway } from "../application/generateCanvasUpscale";
import type { CanvasGenerationTaskRef } from "../application/completeCanvasMediaGenerationTask";

export const freezoneUpscaleGenerationGateway: CanvasUpscaleGenerationGateway = {
  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/upscale`,
      {
        method: "POST",
        json: {
          source_url: command.sourceUrl,
          scale_factor: command.scaleFactor,
          image_size: command.imageSize,
          model: command.model,
        },
      },
    );
  },
};
