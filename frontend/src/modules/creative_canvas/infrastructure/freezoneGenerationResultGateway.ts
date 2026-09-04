// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

const RESULT_URL_KEYS = [
  "url",
  "output_url",
  "image_url",
  "video_url",
  "audio_url",
  "ply_url",
  "splat_url",
] as const;

function resultPath(projectId: string, taskType: string, jobId: string): string {
  return `projects/${encodeURIComponent(projectId)}/freezone/jobs/${encodeURIComponent(taskType)}/${encodeURIComponent(jobId)}/result`;
}

export function fetchCanvasGenerationResult<Result>(
  projectId: string,
  taskType: string,
  jobId: string,
): Promise<Result> {
  return apiCall<Result>(resultPath(projectId, taskType, jobId));
}

export async function fetchCanvasGenerationResultUrl(
  projectId: string,
  taskType: string,
  jobId: string,
): Promise<string> {
  const result = await fetchCanvasGenerationResult<Record<string, unknown>>(
    projectId,
    taskType,
    jobId,
  );
  for (const key of RESULT_URL_KEYS) {
    const value = result[key];
    if (typeof value !== "string") continue;
    const url = value.trim();
    if (url) return url;
  }
  throw new Error("生成结果中没有可用的媒体地址");
}
