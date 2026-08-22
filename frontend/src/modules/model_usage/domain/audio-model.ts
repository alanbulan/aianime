// Copyright (c) 2026 AI anime
export type AudioModelMode = 'speech' | 'voiceClone' | 'music';

export interface AudioCatalogItem {
  code: string;
  displayName: string;
  capabilities: Record<string, unknown>;
}

export interface AudioModelOption {
  value: string;
  label: string;
  supportedModes: AudioModelMode[];
}

export function audioModelOptionsForMode(
  items: readonly AudioCatalogItem[],
  mode: AudioModelMode,
): AudioModelOption[] {
  return items
    .map(audioModelOptionFromCatalog)
    .filter(
      (item): item is AudioModelOption =>
        item !== null && item.supportedModes.includes(mode),
    );
}

export function audioModelOptionFromCatalog(
  item: AudioCatalogItem,
): AudioModelOption | null {
  const declaredModes =
    item.capabilities.supportedModes ??
    item.capabilities.audioModes ??
    item.capabilities.modes;
  const supportedModes = Array.from(
    new Set(
      (Array.isArray(declaredModes) ? declaredModes : [])
        .map(normalizeAudioMode)
        .filter((value): value is AudioModelMode => value !== null),
    ),
  );
  if (supportedModes.length === 0) return null;
  return {
    value: item.code,
    label: item.displayName,
    supportedModes,
  };
}

function normalizeAudioMode(value: unknown): AudioModelMode | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (
    normalized === 'speech' ||
    normalized === 'texttospeech' ||
    normalized === 'speechsynthesis'
  ) {
    return 'speech';
  }
  if (normalized === 'voiceclone') return 'voiceClone';
  if (
    normalized === 'music' ||
    normalized === 'texttomusic' ||
    normalized === 'musicgeneration'
  ) {
    return 'music';
  }
  return null;
}
