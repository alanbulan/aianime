// Copyright (c) 2026 AI anime
import type { VideoGenQuality } from "../domain/canvasNodes";
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./ports";

export interface VideoClipComposeSubmission {
  readonly resolution: "720p" | "1080p";
  readonly trackId: string;
  readonly itemId: string;
  readonly sourceUrl: string;
  readonly sourceStartSeconds: number;
  readonly sourceEndSeconds: number;
}

export interface VideoClipComposeGateway {
  submit(
    projectId: string,
    submission: VideoClipComposeSubmission,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface ComposeVideoClipParams {
  readonly projectId: string;
  readonly nodeId: string;
  readonly sourceUrl: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly quality: VideoGenQuality;
}

export interface ComposeVideoClipDependencies {
  readonly composeGateway: VideoClipComposeGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly now: () => number;
}

export interface ComposeVideoClipResult {
  readonly url: string | null;
  readonly durationMs: number;
}

export async function composeVideoClip(
  params: ComposeVideoClipParams,
  dependencies: ComposeVideoClipDependencies,
): Promise<ComposeVideoClipResult> {
  const task = await dependencies.composeGateway.submit(params.projectId, {
    resolution: params.quality === "1080P" ? "1080p" : "720p",
    trackId: `track_${params.nodeId}_video`,
    itemId: `item_${params.nodeId}_${dependencies.now()}`,
    sourceUrl: params.sourceUrl,
    sourceStartSeconds: params.startMs / 1000,
    sourceEndSeconds: params.endMs / 1000,
  });
  await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  const url = await dependencies.taskGateway.fetchResultUrl(
    params.projectId,
    task.task_type,
    task.job_id,
  );
  return {
    url: url || null,
    durationMs: Math.round(params.endMs - params.startMs),
  };
}
