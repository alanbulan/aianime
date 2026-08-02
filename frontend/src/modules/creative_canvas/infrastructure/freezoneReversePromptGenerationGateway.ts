// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasGenerationTaskRef } from "../application/completeCanvasMediaGenerationTask";
import type { CanvasReversePromptSubmissionGateway } from "../application/generateCanvasReversePrompt";

export const freezoneReversePromptGenerationGateway: CanvasReversePromptSubmissionGateway = {
  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/image/reverse-prompt`,
      {
        method: "POST",
        json: {
          source_url: command.sourceUrl,
          ...(command.canvasId ? { canvas_id: command.canvasId } : {}),
          ...(command.nodeId ? { node_id: command.nodeId } : {}),
        },
      },
    );
  },
};
