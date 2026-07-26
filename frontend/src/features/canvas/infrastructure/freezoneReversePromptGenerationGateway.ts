// Copyright (c) 2026 AI anime
import {
  ensureBackendImageUrl,
  submitFreezoneReversePrompt,
} from "@/api/ops";

import type { CanvasReversePromptSubmissionGateway } from "../application/generateCanvasReversePrompt";

export const freezoneReversePromptGenerationGateway: CanvasReversePromptSubmissionGateway = {
  async prepareSourceUrl(projectId, rawUrl) {
    return await ensureBackendImageUrl(projectId, rawUrl);
  },
  async submit(projectId, command) {
    return await submitFreezoneReversePrompt(projectId, {
      sourceUrl: command.sourceUrl,
      canvasId: command.canvasId,
      nodeId: command.nodeId,
    });
  },
};
