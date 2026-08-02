// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

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
  const result = await fetchCanvasGenerationResult<{ readonly url: string }>(
    projectId,
    taskType,
    jobId,
  );
  return result.url;
}
