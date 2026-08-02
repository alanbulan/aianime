// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasReversePromptSubmissionGateway } from "../application/generateCanvasReversePrompt";
import type { CanvasGenerationTaskRef } from "@/modules/creative_canvas/public";
import { ensureBackendImageUrl } from "./freezoneAssetGateway";

export const freezoneReversePromptGenerationGateway: CanvasReversePromptSubmissionGateway = {
  async prepareSourceUrl(projectId, rawUrl) {
    return await ensureBackendImageUrl(projectId, rawUrl);
  },
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
