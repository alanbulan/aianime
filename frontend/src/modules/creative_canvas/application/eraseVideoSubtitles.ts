// Copyright (c) 2026 AI anime
import {
  completeCanvasMediaGenerationTask,
  requireCanvasGenerationTaskRef,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";
import type {
  VideoSubtitleEraseBox,
  VideoSubtitleEraseMode,
} from "../domain/videoSubtitleErase";

export interface VideoSubtitleEraseSubmission {
  readonly sourceUrl: string;
  readonly mode: "smart_subtitle" | "box";
  readonly box: VideoSubtitleEraseBox | null;
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
  readonly mode: VideoSubtitleEraseMode;
  readonly box: VideoSubtitleEraseBox | null;
}

export interface EraseVideoSubtitlesDependencies {
  readonly eraseGateway: VideoSubtitleEraseGateway;
  readonly taskGateway: CanvasTaskResultGateway;
}

export interface EraseVideoSubtitlesResult {
  readonly url: string;
}

export async function eraseVideoSubtitles(
  params: EraseVideoSubtitlesParams,
  dependencies: EraseVideoSubtitlesDependencies,
): Promise<EraseVideoSubtitlesResult> {
  const task = requireCanvasGenerationTaskRef(
    await dependencies.eraseGateway.submit(params.projectId, {
      sourceUrl: params.sourceUrl,
      mode: params.mode === "box" ? "box" : "smart_subtitle",
      box: params.mode === "box" ? params.box : null,
    }),
    "freezone_video_erase",
  );
  const url = await completeCanvasMediaGenerationTask(
    { projectId: params.projectId, task, media: "video" },
    {
      taskGateway: dependencies.taskGateway,
      onTaskSubmitted: () => undefined,
    },
  );
  return { url };
}
