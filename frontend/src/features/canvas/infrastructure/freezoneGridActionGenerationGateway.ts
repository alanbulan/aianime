// Copyright (c) 2026 AI anime
import { submitFreezoneTemplateEdit } from "@/api/ops";

import type { CanvasGridActionGenerationGateway } from "../application/generateCanvasGridAction";

export const freezoneGridActionGenerationGateway: CanvasGridActionGenerationGateway = {
  async submit(projectId, command) {
    return await submitFreezoneTemplateEdit(projectId, {
      sourceUrl: command.sourceUrl,
      mode: command.mode,
      prompt: command.prompt,
    });
  },
};
