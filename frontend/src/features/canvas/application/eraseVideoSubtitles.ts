// Copyright (c) 2026 AI anime
import type { VideoNodeData } from "../domain/canvasNodes";
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "@/modules/creative_canvas/public";

type SubtitleEraseMode = NonNullable<VideoNodeData["subtitleEraseMode"]>;
type SubtitleEraseBox = NonNullable<VideoNodeData["subtitleEraseBox"]>;

export interface VideoSubtitleEraseSubmission {
  readonly sourceUrl: string;
  readonly mode: "smart_subtitle" | "box";
  readonly box: SubtitleEraseBox | null;
}

export interface VideoSubtitleEraseGateway {
  submit(
    projectId: string,
    submission: VideoSubtitleEraseSubmission,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface EraseVideoSubtitlesParams {
  readonly projectId: string;
  readonly sourceUrl: string;
  readonly mode: SubtitleEraseMode;
  readonly box: SubtitleEraseBox | null;
}

export interface EraseVideoSubtitlesDependencies {
  readonly eraseGateway: VideoSubtitleEraseGateway;
  readonly taskGateway: CanvasTaskResultGateway;
}

export interface EraseVideoSubtitlesResult {
  readonly url: string | null;
}

export async function eraseVideoSubtitles(
  params: EraseVideoSubtitlesParams,
  dependencies: EraseVideoSubtitlesDependencies,
): Promise<EraseVideoSubtitlesResult> {
  const task = await dependencies.eraseGateway.submit(params.projectId, {
    sourceUrl: params.sourceUrl,
    mode: params.mode === "box" ? "box" : "smart_subtitle",
    box: params.mode === "box" ? params.box : null,
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
  return { url: url || null };
}
