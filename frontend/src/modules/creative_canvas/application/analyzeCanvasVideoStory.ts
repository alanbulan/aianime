// Copyright (c) 2026 AI anime
import {
  requireCanvasGenerationTaskRef,
  type CanvasStructuredTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";
import { normalizeVideoStoryRows } from "./videoStoryNormalizer";

export interface CanvasVideoStoryAnalysisCommand {
  readonly videoUrl: string;
  readonly durationSec?: number;
}

export interface CanvasVideoStoryAnalysisSubmission {
  readonly task: {
    readonly job_id: string;
    readonly task_key: string;
    readonly task_type: "freezone_video_story";
  } | null;
  readonly inlineResult: Record<string, unknown>;
}

export interface CanvasVideoStoryAnalysisSubmissionGateway {
  submit(
    projectId: string,
    command: CanvasVideoStoryAnalysisCommand,
  ): Promise<CanvasVideoStoryAnalysisSubmission>;
}

export interface AnalyzeCanvasVideoStoryParams {
  readonly projectId: string;
  readonly videoUrl: string;
  readonly durationMs?: number | null;
}

export interface AnalyzeCanvasVideoStoryDependencies {
  readonly submissionGateway: CanvasVideoStoryAnalysisSubmissionGateway;
  readonly taskGateway: CanvasStructuredTaskResultGateway;
}

function completedAnalysisResult(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  return Object.keys(result).length > 0 ? result : null;
}

export async function analyzeCanvasVideoStory(
  params: AnalyzeCanvasVideoStoryParams,
  dependencies: AnalyzeCanvasVideoStoryDependencies,
) {
  const submission = await dependencies.submissionGateway.submit(
    params.projectId,
    {
      videoUrl: params.videoUrl,
      durationSec:
        typeof params.durationMs === "number" && params.durationMs > 0
          ? params.durationMs / 1000
          : undefined,
    },
  );
  let rawResult = submission.inlineResult;
  if (submission.task) {
    const task = requireCanvasGenerationTaskRef(
      submission.task,
      "freezone_video_story",
    );
    const completion = await dependencies.taskGateway.awaitCompletion(
      task.task_key,
      params.projectId,
    );
    rawResult =
      completedAnalysisResult(completion.result)
      ?? await dependencies.taskGateway.fetchResult<Record<string, unknown>>(
        params.projectId,
        task.task_type,
        task.job_id,
      );
  }
  return {
    rawResult,
    rows: normalizeVideoStoryRows(rawResult),
  };
}
