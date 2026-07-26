// Copyright (c) 2026 AI anime
import { resolveCanvasAudioSeparationOutputs } from "./audioSeparationResult";
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./ports";

export interface CanvasAudioSeparationCommand {
  readonly sourceUrl: string;
  readonly targetEpisode?: number;
  readonly targetBeat?: number;
}

export interface CanvasAudioSeparationTaskRef
  extends CanvasGenerationTaskRef {
  readonly task_type: "freezone_audio_separate";
}

export interface CanvasAudioSeparationGateway {
  submit(
    projectId: string,
    command: CanvasAudioSeparationCommand,
  ): Promise<CanvasAudioSeparationTaskRef>;
  fetchResult(
    projectId: string,
    jobId: string,
  ): Promise<Record<string, unknown>>;
}

export interface SeparateCanvasAudioVideoParams
  extends CanvasAudioSeparationCommand {
  readonly projectId: string;
}

export interface SeparateCanvasAudioVideoDependencies {
  readonly audioSeparationGateway: CanvasAudioSeparationGateway;
  readonly taskGateway: Pick<CanvasTaskResultGateway, "awaitCompletion">;
}

export interface SeparateCanvasAudioVideoResult {
  readonly audioUrl: string | null;
  readonly silentVideoUrl: string | null;
  readonly resultFallbackError?: unknown;
}

export async function separateCanvasAudioVideo(
  params: SeparateCanvasAudioVideoParams,
  dependencies: SeparateCanvasAudioVideoDependencies,
): Promise<SeparateCanvasAudioVideoResult> {
  const task = await dependencies.audioSeparationGateway.submit(
    params.projectId,
    {
      sourceUrl: params.sourceUrl,
      targetEpisode: params.targetEpisode,
      targetBeat: params.targetBeat,
    },
  );
  const completion = await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  let { audioUrl, silentVideoUrl } = resolveCanvasAudioSeparationOutputs(
    completion.result,
  );
  let resultFallbackError: unknown;
  let resultFallbackFailed = false;

  if (!audioUrl || !silentVideoUrl) {
    try {
      const fallback = resolveCanvasAudioSeparationOutputs(
        await dependencies.audioSeparationGateway.fetchResult(
          params.projectId,
          task.job_id,
        ),
      );
      audioUrl = audioUrl ?? fallback.audioUrl;
      silentVideoUrl = silentVideoUrl ?? fallback.silentVideoUrl;
    } catch (error) {
      resultFallbackError = error;
      resultFallbackFailed = true;
    }
  }

  return {
    audioUrl,
    silentVideoUrl,
    ...(resultFallbackFailed ? { resultFallbackError } : {}),
  };
}
