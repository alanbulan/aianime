// Copyright (c) 2026 AI anime
import type { AudioVoiceRef } from "../domain/audioVoice";

export type CanvasAudioTextSegment =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "pause"; readonly durationSec: number }
  | { readonly type: "filler"; readonly token: string };

export interface CanvasAudioPromptSource {
  readonly text?: string;
  readonly segments?: readonly CanvasAudioTextSegment[];
}

export interface CanvasAudioGenerationTaskRef {
  readonly job_id: string;
  readonly task_key: string;
  readonly task_type: string;
}

export function deriveAudioText(data: CanvasAudioPromptSource): string {
  if (typeof data.text === "string") return data.text;
  if (Array.isArray(data.segments)) {
    return data.segments
      .map((segment: CanvasAudioTextSegment) =>
        segment.type === "text" ? segment.value : "",
      )
      .join("");
  }
  return "";
}

export function buildCanvasAudioPrompt(
  data: CanvasAudioPromptSource,
  upstreamText: string,
): string {
  return [upstreamText.trim(), deriveAudioText(data).trim()]
    .filter((segment) => segment.length > 0)
    .join("\n\n");
}

export interface CanvasAudioSpeechCommand {
  readonly text: string;
  readonly emotionPrompt?: string;
  readonly voiceRef: AudioVoiceRef;
}

export interface CanvasAudioMusicCommand {
  readonly prompt: string;
  readonly musicLengthMs?: number;
  readonly forceInstrumental: boolean;
  readonly respectSectionsDurations: boolean;
}

export interface CanvasAudioGenerationSubmissionGateway {
  submitSpeech(
    projectId: string,
    command: CanvasAudioSpeechCommand,
  ): Promise<CanvasAudioGenerationTaskRef>;
  submitMusic(
    projectId: string,
    command: CanvasAudioMusicCommand,
  ): Promise<CanvasAudioGenerationTaskRef>;
}

export interface CanvasAudioGenerationResultGateway {
  fetchResultUrl(
    projectId: string,
    taskType: "freezone_audio_speech" | "freezone_audio_eleven_music",
    jobId: string,
  ): Promise<string>;
}

export interface CanvasAudioGenerationTaskGateway {
  awaitCompletion(taskKey: string, projectId: string): Promise<void>;
}

interface GenerateCanvasAudioBaseParams {
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
  readonly resultGateway: CanvasAudioGenerationResultGateway;
  readonly taskGateway: CanvasAudioGenerationTaskGateway;
  readonly onTaskSubmitted: (task: CanvasAudioGenerationTaskRef) => void;
}

export interface GenerateCanvasAudioResult {
  readonly task: CanvasAudioGenerationTaskRef;
  readonly audioUrl: string;
}

export async function generateCanvasAudio(
  params: GenerateCanvasAudioParams,
  dependencies: GenerateCanvasAudioDependencies,
): Promise<GenerateCanvasAudioResult> {
  const task =
    params.kind === "music"
      ? await dependencies.submissionGateway.submitMusic(params.projectId, {
          prompt: params.prompt,
          ...(typeof params.musicLengthMs === "number"
            ? { musicLengthMs: params.musicLengthMs }
            : {}),
          forceInstrumental: params.forceInstrumental ?? true,
          respectSectionsDurations:
            params.respectSectionsDurations ?? true,
        })
      : await dependencies.submissionGateway.submitSpeech(params.projectId, {
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
  const audioUrl = await dependencies.resultGateway.fetchResultUrl(
    params.projectId,
    taskType,
    task.job_id,
  );
  return { task, audioUrl };
}
