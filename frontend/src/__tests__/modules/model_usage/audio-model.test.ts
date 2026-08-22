// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  audioModelOptionsForMode,
  type AudioCatalogItem,
} from '@/modules/model_usage/public';

function item(code: string, supportedModes?: unknown): AudioCatalogItem {
  return {
    code,
    displayName: `Model ${code}`,
    capabilities:
      supportedModes === undefined ? {} : { supportedModes },
  };
}

describe('audioModelCatalog', () => {
  it('selects models only from declared AUDIO modes', () => {
    const items = [
      item('speech-a', ['TEXT_TO_SPEECH']),
      item('music-a', ['MUSIC_GENERATION']),
      item('both-a', ['voice-clone', 'text_to_music']),
    ];
    expect(audioModelOptionsForMode(items, 'speech').map((model) => model.value))
      .toEqual(['speech-a']);
    expect(
      audioModelOptionsForMode(items, 'voiceClone').map((model) => model.value),
    ).toEqual(['both-a']);
    expect(audioModelOptionsForMode(items, 'music').map((model) => model.value))
      .toEqual(['music-a', 'both-a']);
  });

  it('does not infer capability from a model code', () => {
    expect(
      audioModelOptionsForMode(
        [item('obvious-speech-model'), item('obvious-music-model', ['UNKNOWN'])],
        'speech',
      ),
    ).toEqual([]);
  });
});
