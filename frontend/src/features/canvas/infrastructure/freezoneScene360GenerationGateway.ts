// Copyright (c) 2026 AI anime
import { submitFreezoneScene360 } from "@/api/ops";

import type { CanvasScene360GenerationGateway } from "../application/generateCanvasScene360";

export const freezoneScene360GenerationGateway: CanvasScene360GenerationGateway = {
  async submit(projectId, command) {
    return await submitFreezoneScene360(projectId, {
      referenceUrl: command.referenceUrl,
      aspectRatio: command.aspectRatio,
    });
  },
};
