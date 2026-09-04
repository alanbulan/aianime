// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasGenerationTaskRef } from "../application/completeCanvasMediaGenerationTask";
import type { CanvasGridActionGenerationGateway } from "../application/generateCanvasGridAction";

export const freezoneGridActionGenerationGateway: CanvasGridActionGenerationGateway = {
  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/template-edit`,
      {
        method: "POST",
        json: {
          canvas_id: command.canvasId,
          node_id: command.nodeId,
          source_url: command.sourceUrl,
          mode: command.mode,
          prompt: command.prompt,
          model: command.model,
          ...(command.modelSelector ? { model_id: command.modelSelector } : {}),
        },
      },
    );
  },
};
