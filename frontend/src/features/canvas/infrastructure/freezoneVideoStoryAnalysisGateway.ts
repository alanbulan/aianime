// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasVideoStoryAnalysisSubmissionGateway } from "../application/analyzeCanvasVideoStory";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const freezoneVideoStoryAnalysisGateway: CanvasVideoStoryAnalysisSubmissionGateway = {
  async submit(projectId, command) {
    const response = await apiCall<unknown>(
      `projects/${encodeURIComponent(projectId)}/freezone/analyze-video-story`,
      {
        method: "POST",
        json: {
          video_url: command.videoUrl,
          ...(command.durationSec != null
            ? { duration_sec: command.durationSec }
            : {}),
        },
      },
    );
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
