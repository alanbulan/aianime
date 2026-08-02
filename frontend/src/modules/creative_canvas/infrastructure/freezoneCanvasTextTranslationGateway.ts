// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasGenerationTaskRef } from "../application/completeCanvasMediaGenerationTask";
import type { CanvasTextTranslationGateway } from "../application/translateCanvasText";

export const freezoneCanvasTextTranslationGateway: CanvasTextTranslationGateway = {
  async submit(projectId, submission) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/text/translate`,
      {
        method: "POST",
        json: {
          text: submission.text,
          model: submission.model,
          node_type: submission.nodeType ?? "generic",
          ...(submission.canvasId ? { canvas_id: submission.canvasId } : {}),
          ...(submission.nodeId ? { node_id: submission.nodeId } : {}),
        },
      },
    );
  },
  async fetchTranslatedText(projectId, jobId) {
    const result = await apiCall<{ translated_text: string }>(
      `projects/${encodeURIComponent(projectId)}/freezone/jobs/freezone_text_translate/${encodeURIComponent(jobId)}/result`,
    );
    return result.translated_text;
  },
};
