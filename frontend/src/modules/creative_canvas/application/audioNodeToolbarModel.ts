// Copyright (c) 2026 AI anime

export type AudioNodeToolbarFormat = "mp3" | "m4a" | "wav";

export interface AudioNodeToolbarSource {
  readonly audioUrl: string | null;
  readonly sourceFileName?: string | null;
  readonly displayName?: string | null;
  readonly convertingAudioFormat?: AudioNodeToolbarFormat | null;
}

export interface AudioNodeToolbarProjection {
  audioUrl: string | null;
  hasAudio: boolean;
  baseFilename: string;
  convertingFormat: AudioNodeToolbarFormat | null;
  isConverting: boolean;
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function projectAudioNodeToolbar(
  nodeId: string,
  data: AudioNodeToolbarSource,
): AudioNodeToolbarProjection {
  const audioUrl = typeof data.audioUrl === "string" ? data.audioUrl : null;
  const sourceFilename = trimmedString(data.sourceFileName);
  const displayName = trimmedString(data.displayName);
  const rawFilename = sourceFilename || displayName || `audio-${nodeId}`;
  const baseFilename = rawFilename.replace(
    /\.(mp3|m4a|aac|wav|flac|ogg|opus|mp4|m4b)$/i,
    "",
  );
  const convertingFormat = data.convertingAudioFormat ?? null;

  return {
    audioUrl,
    hasAudio: Boolean(audioUrl),
    baseFilename,
    convertingFormat,
    isConverting: Boolean(convertingFormat),
  };
}

export function resolveAudioNodeDownloadFilename(
  baseFilename: string,
  format: AudioNodeToolbarFormat,
): string {
  return `${baseFilename}.${format}`;
}
