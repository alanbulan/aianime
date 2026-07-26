// Copyright (c) 2026 AI anime
import { submitFreezoneMultiView } from "@/api/ops";

import type { CanvasMultiAngleGenerationGateway } from "../application/generateCanvasMultiAngle";

export const freezoneMultiAngleGenerationGateway: CanvasMultiAngleGenerationGateway = {
  async submit(projectId, command) {
    return await submitFreezoneMultiView(projectId, {
      sourceUrl: command.sourceUrl,
      preset: command.preset,
      yawDegrees: command.yawDegrees,
      pitchDegrees: command.pitchDegrees,
      shotSize: command.shotSize,
      prompt: command.prompt,
      model: command.model,
      imageSize: command.imageSize,
    });
  },
};
