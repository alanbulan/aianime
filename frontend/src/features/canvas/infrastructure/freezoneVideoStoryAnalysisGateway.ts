// Copyright (c) 2026 AI anime
import { submitFreezoneAnalyzeVideoStory } from "@/api/ops";

import type { CanvasVideoStoryAnalysisSubmissionGateway } from "../application/analyzeCanvasVideoStory";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const freezoneVideoStoryAnalysisGateway: CanvasVideoStoryAnalysisSubmissionGateway = {
  async submit(projectId, command) {
    const response: unknown = await submitFreezoneAnalyzeVideoStory(projectId, {
      videoUrl: command.videoUrl,
      durationSec: command.durationSec,
    });
    const inlineResult = asRecord(response);
    return {
      taskKey:
        typeof inlineResult.task_key === "string"
          ? inlineResult.task_key
          : null,
      inlineResult,
    };
  },
};
