// Copyright (c) 2026 AI anime
import { submitFreezoneRelight } from "@/api/ops";

import type { CanvasRelightGenerationGateway } from "../application/generateCanvasRelight";

export const freezoneRelightGenerationGateway: CanvasRelightGenerationGateway = {
  async submit(projectId, command) {
    return await submitFreezoneRelight(projectId, {
      sourceUrl: command.sourceUrl,
      lightingReferenceUrl: command.lightingReferenceUrl,
      scope: command.scope,
      smartMode: command.smartMode,
      brightness: command.brightness,
      colorHex: command.colorHex,
      colorTemperatureKelvin: command.colorTemperatureKelvin,
      keyLightDirection: command.keyLightDirection,
      rimLight: command.rimLight,
      prompt: command.prompt,
      imageSize: command.imageSize,
      model: command.model,
    });
  },
};
