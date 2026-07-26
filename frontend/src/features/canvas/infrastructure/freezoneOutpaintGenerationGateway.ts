// Copyright (c) 2026 AI anime
import { submitFreezoneOutpaint } from "@/api/ops";

import type { CanvasOutpaintGenerationGateway } from "../application/generateCanvasOutpaint";

export const freezoneOutpaintGenerationGateway: CanvasOutpaintGenerationGateway = {
  async submit(projectId, command) {
    return await submitFreezoneOutpaint(projectId, {
      sourceUrl: command.sourceUrl,
      targetAspectRatio: command.targetAspectRatio,
      numImages: command.numImages,
      imageSize: command.imageSize,
      model: command.model,
    });
  },
};
