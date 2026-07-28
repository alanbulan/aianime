// Copyright (c) 2026 AI anime
import {
  awaitTaskCompletion,
  type TaskMonitorState,
} from "@/task-center/public";
import { apiCall } from "@/shared/api/client";

import type {
  PipelineShotAnalysis,
  PipelineVideoProcessingGateway,
} from "../application/video-processing";

interface PipelineTaskTransport {
  readonly task_key: string;
}

function frameUrls(task: TaskMonitorState): string[] {
  const urls = task.result?.["frame_urls"];
  return Array.isArray(urls)
    ? urls.filter((url): url is string => typeof url === "string")
    : [];
}

function shotAnalyses(task: TaskMonitorState): PipelineShotAnalysis[] {
  const analyses = task.result?.["analyses"];
  return Array.isArray(analyses)
    ? (analyses as PipelineShotAnalysis[])
    : [];
}

export const freezonePipelineVideoProcessingGateway: PipelineVideoProcessingGateway = {
  async extractFrames(params) {
    const task = await apiCall<PipelineTaskTransport>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/extract-frames`,
      {
        method: "POST",
        json: {
          video_url: params.videoUrl,
          max_frames: params.maxFrames ?? 20,
          scene_threshold: params.sceneThreshold ?? 0.3,
        },
      },
    );
    return frameUrls(
      await awaitTaskCompletion(task.task_key, params.projectId),
    );
  },
  async analyzeFrames(params) {
    const task = await apiCall<PipelineTaskTransport>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/analyze-shots`,
      {
        method: "POST",
        json: {
          frame_urls: [...params.frameUrls],
          provider: "openrouter",
          model: null,
        },
      },
    );
    return shotAnalyses(
      await awaitTaskCompletion(task.task_key, params.projectId),
    );
  },
};
