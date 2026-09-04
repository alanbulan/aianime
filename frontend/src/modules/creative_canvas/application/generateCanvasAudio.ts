// Copyright (c) 2026 AI anime
import type { AudioVoiceRef } from "../domain/audioVoice";
import {
  completeCanvasMediaGenerationTask,
  requireCanvasGenerationTaskRef,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";

export type CanvasAudioTextSegment =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "pause"; readonly durationSec: number }
  | { readonly type: "filler"; readonly token: string };

export interface CanvasAudioPromptSource {
  readonly text?: string;
  readonly segments?: readonly CanvasAudioTextSegment[];
}

export interface CanvasAudioGenerationTaskRef extends CanvasGenerationTaskRef {
  readonly task_type: "freezone_audio_speech" | "freezone_audio_music";
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
  readonly taskGateway: CanvasTaskResultGateway;
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
  const taskType =
    params.kind === "music"
      ? "freezone_audio_music"
      : "freezone_audio_speech";
  const submittedTask =
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
  const task = requireCanvasGenerationTaskRef(
    submittedTask,
    taskType,
  ) as CanvasAudioGenerationTaskRef;
  const audioUrl = await completeCanvasMediaGenerationTask(
    { projectId: params.projectId, task, media: "audio" },
    {
      taskGateway: dependencies.taskGateway,
      onTaskSubmitted: () => dependencies.onTaskSubmitted(task),
    },
  );
  return { task, audioUrl };
}
