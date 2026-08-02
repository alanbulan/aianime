// Copyright (c) 2026 AI anime
import type { CanvasTaskResultGateway } from "./completeCanvasMediaGenerationTask";
import { normalizeVideoStoryRows } from "./videoStoryNormalizer";

export interface CanvasVideoStoryAnalysisCommand {
  readonly videoUrl: string;
  readonly durationSec?: number;
}

export interface CanvasVideoStoryAnalysisSubmission {
  readonly taskKey: string | null;
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
  readonly taskGateway: Pick<CanvasTaskResultGateway, "awaitCompletion">;
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
  const rawResult = submission.taskKey
    ? ((await dependencies.taskGateway.awaitCompletion(
        submission.taskKey,
        params.projectId,
      )).result ?? {})
    : submission.inlineResult;
  return {
    rawResult,
    rows: normalizeVideoStoryRows(rawResult),
  };
}
