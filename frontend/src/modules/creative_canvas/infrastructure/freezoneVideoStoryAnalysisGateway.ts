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
    const taskKey =
      typeof inlineResult.task_key === "string"
        ? inlineResult.task_key.trim()
        : "";
    const jobId =
      typeof inlineResult.job_id === "string"
        ? inlineResult.job_id.trim()
        : "";
    const taskType =
      typeof inlineResult.task_type === "string"
        ? inlineResult.task_type.trim()
        : "";
    const hasTaskReceipt = Boolean(taskKey || jobId || taskType);
    if (
      hasTaskReceipt
      && (!taskKey || !jobId || taskType !== "freezone_video_story")
    ) {
      throw new Error("视频解读任务回执不完整或任务类型不匹配");
    }
    return {
      task: hasTaskReceipt
        ? {
            task_key: taskKey,
            job_id: jobId,
            task_type: "freezone_video_story" as const,
          }
        : null,
      inlineResult,
    };
  },
};
