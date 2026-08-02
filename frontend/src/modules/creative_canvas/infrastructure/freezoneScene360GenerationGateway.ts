// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasGenerationTaskRef } from "../application/completeCanvasMediaGenerationTask";
import type { CanvasScene360GenerationGateway } from "../application/generateCanvasScene360";

export const freezoneScene360GenerationGateway: CanvasScene360GenerationGateway = {
  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/scene-360`,
      {
        method: "POST",
        json: {
          reference_url: command.referenceUrl,
          image_size: "2K",
          mode: "candidate",
          aspect_ratio: command.aspectRatio,
          model: command.model,
        },
      },
    );
  },
};
