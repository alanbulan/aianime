// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasMultiAngleGenerationGateway } from "../application/generateCanvasMultiAngle";
import type { CanvasGenerationTaskRef } from "../application/completeCanvasMediaGenerationTask";

export const freezoneMultiAngleGenerationGateway: CanvasMultiAngleGenerationGateway = {
  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/multi-view`,
      {
        method: "POST",
        json: {
          source_url: command.sourceUrl,
          preset: command.preset,
          yaw_degrees: command.yawDegrees,
          pitch_degrees: command.pitchDegrees,
          shot_size: command.shotSize,
          prompt: command.prompt,
          image_size: command.imageSize,
          model: command.model,
          ...(command.modelSelector ? { model_id: command.modelSelector } : {}),
        },
      },
    );
  },
};
