// Copyright (c) 2026 AI anime
import { submitFreezoneUpscale } from "@/api/ops";

import type { CanvasUpscaleGenerationGateway } from "../application/generateCanvasUpscale";

export const freezoneUpscaleGenerationGateway: CanvasUpscaleGenerationGateway = {
  async submit(projectId, command) {
    return await submitFreezoneUpscale(projectId, {
      sourceUrl: command.sourceUrl,
      scaleFactor: command.scaleFactor,
      imageSize: command.imageSize,
      model: command.model,
    });
  },
};
