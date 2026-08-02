// Copyright (c) 2026 AI anime
import type {
  AudioNodeData,
  AudioTextSegment,
} from "../domain/canvasNodes";
import type { AudioVoiceRef } from "@/modules/creative_canvas/public";
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./ports";

export function deriveAudioText(data: AudioNodeData): string {
  if (typeof data.text === "string") return data.text;
  if (Array.isArray(data.segments)) {
    return data.segments
      .map((segment: AudioTextSegment) =>
        segment.type === "text" ? segment.value : "",
      )
      .join("");
  }
  return "";
}

export function buildCanvasAudioPrompt(
  data: AudioNodeData,
  upstreamText: string,
): string {
  return [upstreamText.trim(), deriveAudioText(data).trim()]
    .filter((segment) => segment.length > 0)
    .join("\n\n");
}

export interface CanvasAudioSpeechCommand {
  readonly model: string;
  readonly text: string;
  readonly emotionPrompt?: string;
  readonly voiceRef: AudioVoiceRef;
}

export interface CanvasAudioMusicCommand {
  readonly model: string;
  readonly prompt: string;
  readonly musicLengthMs?: number;
  readonly forceInstrumental: boolean;
  readonly respectSectionsDurations: boolean;
}

export interface CanvasAudioGenerationSubmissionGateway {
  submitSpeech(
    projectId: string,
    command: CanvasAudioSpeechCommand,
  ): Promise<CanvasGenerationTaskRef>;
  submitMusic(
    projectId: string,
    command: CanvasAudioMusicCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

interface GenerateCanvasAudioBaseParams {
  readonly model: string;
  readonly projectId: string;
  readonly prompt: string;
}

export interface GenerateCanvasSpeechParams
  extends GenerateCanvasAudioBaseParams {
  readonly kind: "speech";
  readonly emotionPrompt?: string;
  readonly voiceRef?: AudioVoiceRef | null;
}

export interface GenerateCanvasMusicParams extends GenerateCanvasAudioBaseParams {
  readonly kind: "music";
  readonly musicLengthMs?: unknown;
  readonly forceInstrumental?: boolean;
  readonly respectSectionsDurations?: boolean;
}

export type GenerateCanvasAudioParams =
  | GenerateCanvasSpeechParams
  | GenerateCanvasMusicParams;

export interface GenerateCanvasAudioDependencies {
  readonly submissionGateway: CanvasAudioGenerationSubmissionGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasAudioResult {
  readonly task: CanvasGenerationTaskRef;
  readonly audioUrl: string;
}

export async function generateCanvasAudio(
  params: GenerateCanvasAudioParams,
  dependencies: GenerateCanvasAudioDependencies,
): Promise<GenerateCanvasAudioResult> {
  const task =
    params.kind === "music"
      ? await dependencies.submissionGateway.submitMusic(params.projectId, {
          model: params.model,
          prompt: params.prompt,
          ...(typeof params.musicLengthMs === "number"
            ? { musicLengthMs: params.musicLengthMs }
            : {}),
          forceInstrumental: params.forceInstrumental ?? true,
          respectSectionsDurations:
            params.respectSectionsDurations ?? true,
        })
      : await dependencies.submissionGateway.submitSpeech(params.projectId, {
          model: params.model,
          text: params.prompt,
          ...(params.emotionPrompt?.trim()
            ? { emotionPrompt: params.emotionPrompt.trim() }
            : {}),
          voiceRef: params.voiceRef ?? { scope: "project_narrator" },
        });
  dependencies.onTaskSubmitted(task);
  await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  const taskType =
    params.kind === "music"
      ? "freezone_audio_eleven_music"
      : "freezone_audio_speech";
  const audioUrl = await dependencies.taskGateway.fetchResultUrl(
    params.projectId,
    taskType,
    task.job_id,
  );
  return { task, audioUrl };
}
