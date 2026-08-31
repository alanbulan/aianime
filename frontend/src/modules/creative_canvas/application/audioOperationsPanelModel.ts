// Copyright (c) 2026 AI anime
import type { AudioVoiceRef } from '../domain/audioVoice';

export const DEFAULT_MUSIC_LENGTH_MS = 30_000;

export const MUSIC_LENGTH_PRESETS: ReadonlyArray<{
  ms: number;
  label: string;
}> = [
  { ms: 30_000, label: '30秒' },
  { ms: 60_000, label: '1分钟' },
  { ms: 120_000, label: '2分钟' },
  { ms: 180_000, label: '3分钟' },
  { ms: 240_000, label: '4分钟' },
  { ms: 300_000, label: '5分钟' },
  { ms: 600_000, label: '10分钟' },
];

export interface AudioMusicSettings {
  musicLengthMs: number;
  forceInstrumental: boolean;
  respectSectionsDurations: boolean;
}

export interface AudioVoiceSettings {
  voiceLabel: string;
  voiceLanguage: string;
  currentRef: AudioVoiceRef;
  generationMode: 'speech' | 'voiceClone';
  modeLabel: string;
}

export interface AudioOperationsNodeSource {
  readonly musicLengthMs?: number;
  readonly forceInstrumental?: boolean;
  readonly respectSectionsDurations?: boolean;
  readonly voiceLabel?: string;
  readonly voiceLanguage?: string;
  readonly voiceRef?: AudioVoiceRef | null;
}

export interface AudioUpstreamTextSource {
  readonly text: string;
}

export function resolveAudioMusicSettings(
  data: AudioOperationsNodeSource,
): AudioMusicSettings {
  return {
    musicLengthMs:
      typeof data.musicLengthMs === 'number'
        ? data.musicLengthMs
        : DEFAULT_MUSIC_LENGTH_MS,
    forceInstrumental: data.forceInstrumental ?? true,
    respectSectionsDurations: data.respectSectionsDurations ?? true,
  };
}

export function resolveAudioVoiceSettings(
  data: AudioOperationsNodeSource,
): AudioVoiceSettings {
  const currentRef = data.voiceRef ?? { scope: 'project_narrator' as const };
  const usesModelPreset = currentRef.scope === 'model_preset';
  return {
    voiceLabel: data.voiceLabel ?? '加载中…',
    voiceLanguage: data.voiceLanguage ?? '',
    currentRef,
    generationMode: usesModelPreset ? 'speech' : 'voiceClone',
    modeLabel: usesModelPreset ? '预设音色' : '参考音频克隆',
  };
}

export function filterAudioUpstreamTextContents<
  Content,
>(contents: readonly Content[]): Array<Content & AudioUpstreamTextSource> {
  return contents.filter(
    (content): content is Content & AudioUpstreamTextSource => {
      if (content == null || typeof content !== 'object') return false;
      const text = (content as { readonly text?: unknown }).text;
      return typeof text === 'string' && text.trim().length > 0;
    },
  );
}

export function isAudioSubmitDisabled(
  isGenerating: boolean,
  effectivePrompt: string,
): boolean {
  return isGenerating || effectivePrompt.length === 0;
}
