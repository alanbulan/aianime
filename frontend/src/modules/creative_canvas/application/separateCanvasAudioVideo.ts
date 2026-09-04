// Copyright (c) 2026 AI anime
import { resolveCanvasAudioSeparationOutputs } from "./audioSeparationResult";
import {
  requireCanvasGenerationTaskRef,
  type CanvasGenerationTaskRef,
  type CanvasStructuredTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";

export interface CanvasAudioSeparationCommand {
  readonly sourceUrl: string;
  readonly targetEpisode?: number;
  readonly targetBeat?: number;
}

export interface CanvasAudioSeparationTaskRef extends CanvasGenerationTaskRef {
  readonly task_type: "freezone_audio_separate";
}

export interface CanvasAudioSeparationGateway {
  submit(
    projectId: string,
    command: CanvasAudioSeparationCommand,
  ): Promise<CanvasAudioSeparationTaskRef>;
}

export interface SeparateCanvasAudioVideoParams
  extends CanvasAudioSeparationCommand {
  readonly projectId: string;
}

export interface SeparateCanvasAudioVideoDependencies {
  readonly audioSeparationGateway: CanvasAudioSeparationGateway;
  readonly taskGateway: CanvasStructuredTaskResultGateway;
}

export interface SeparateCanvasAudioVideoResult {
  readonly audioUrl: string;
  readonly silentVideoUrl: string;
}

export async function separateCanvasAudioVideo(
  params: SeparateCanvasAudioVideoParams,
  dependencies: SeparateCanvasAudioVideoDependencies,
): Promise<SeparateCanvasAudioVideoResult> {
  const task = requireCanvasGenerationTaskRef(
    await dependencies.audioSeparationGateway.submit(
      params.projectId,
      {
        sourceUrl: params.sourceUrl,
        targetEpisode: params.targetEpisode,
        targetBeat: params.targetBeat,
      },
    ),
    "freezone_audio_separate",
  ) as CanvasAudioSeparationTaskRef;
  const completion = await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  let { audioUrl, silentVideoUrl } = resolveCanvasAudioSeparationOutputs(
    completion.result,
  );
  let resultFallbackError: unknown;

  if (!audioUrl || !silentVideoUrl) {
    try {
      const fallback = resolveCanvasAudioSeparationOutputs(
        await dependencies.taskGateway.fetchResult<Record<string, unknown>>(
          params.projectId,
          task.task_type,
          task.job_id,
        ),
      );
      audioUrl = audioUrl ?? fallback.audioUrl;
      silentVideoUrl = silentVideoUrl ?? fallback.silentVideoUrl;
    } catch (error) {
      resultFallbackError = error;
    }
  }

  if (!audioUrl || !silentVideoUrl) {
    if (resultFallbackError) throw resultFallbackError;
    throw new Error("音视频分离任务已完成，但没有返回完整的音频和视频地址");
  }

  return {
    audioUrl,
    silentVideoUrl,
  };
}
