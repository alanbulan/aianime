// Copyright (c) 2026 AI anime
import {
  fetchFreezoneTextTranslateResult,
  submitFreezoneTextTranslate,
} from "@/api/ops";

import type { CanvasTextTranslationGateway } from "../application/translateCanvasText";

export const freezoneCanvasTextTranslationGateway: CanvasTextTranslationGateway = {
  async submit(projectId, submission) {
    return await submitFreezoneTextTranslate(projectId, {
      text: submission.text,
      nodeType: submission.nodeType,
      canvasId: submission.canvasId,
      nodeId: submission.nodeId,
    });
  },
  async fetchTranslatedText(projectId, jobId) {
    const result = await fetchFreezoneTextTranslateResult(projectId, jobId);
    return result.translated_text;
  },
};
