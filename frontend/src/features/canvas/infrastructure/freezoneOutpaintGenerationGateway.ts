// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasOutpaintGenerationGateway } from "../application/generateCanvasOutpaint";
import type { CanvasGenerationTaskRef } from "../application/ports";

export const freezoneOutpaintGenerationGateway: CanvasOutpaintGenerationGateway = {
  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/outpaint`,
      {
        method: "POST",
        json: {
          source_url: command.sourceUrl,
          target_aspect_ratio: command.targetAspectRatio,
          num_images: command.numImages,
          image_size: command.imageSize,
          ...(command.model ? { model: command.model } : {}),
        },
      },
    );
  },
};
