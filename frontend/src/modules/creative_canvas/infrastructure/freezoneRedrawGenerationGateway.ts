// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasGenerationTaskRef } from "../application/completeCanvasMediaGenerationTask";
import type { CanvasRedrawGenerationGateway } from "../application/generateCanvasRedraw";

export const freezoneRedrawGenerationGateway: CanvasRedrawGenerationGateway = {
  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/redraw`,
      {
        method: "POST",
        json: {
          source_url: command.sourceUrl,
          mask_url: command.maskUrl ?? null,
          prompt: command.prompt ?? "",
          aspect_ratio: command.aspectRatio,
          num_images: 1,
          image_size: command.imageSize,
          model: command.model,
          ...(command.modelSelector ? { model_id: command.modelSelector } : {}),
        },
      },
    );
  },
};
