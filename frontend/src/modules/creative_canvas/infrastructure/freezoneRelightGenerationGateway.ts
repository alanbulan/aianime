// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasGenerationTaskRef } from "../application/completeCanvasMediaGenerationTask";
import type { CanvasRelightGenerationGateway } from "../application/generateCanvasRelight";

export const freezoneRelightGenerationGateway: CanvasRelightGenerationGateway = {
  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/relight`,
      {
        method: "POST",
        json: {
          source_url: command.sourceUrl,
          lighting_reference_url: command.lightingReferenceUrl,
          scope: command.scope,
          smart_mode: command.smartMode,
          brightness: command.brightness,
          color_hex: command.colorHex,
          color_temperature_kelvin: command.colorTemperatureKelvin,
          key_light_direction: command.keyLightDirection,
          rim_light: command.rimLight,
          prompt: command.prompt,
          image_size: command.imageSize,
          model: command.model,
        },
      },
    );
  },
};
