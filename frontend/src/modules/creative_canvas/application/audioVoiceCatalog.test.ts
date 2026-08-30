// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  audioVoiceRefKey,
  describeAudioVoiceRef,
} from './audioVoiceCatalog';

describe('audioVoiceCatalog', () => {
  it('includes every discriminator in the stable voice reference key', () => {
    expect(
      audioVoiceRefKey({
        scope: 'character_age_group',
        characterName: '林夏',
        slot: '青年',
        voiceId: 'voice-a',
      }),
    ).toBe('character_age_group|林夏||青年|||voice-a');
    expect(
      audioVoiceRefKey({
        scope: 'model_preset',
        modelId: 'speech-a',
        voiceId: 'alex',
      }),
    ).toBe('model_preset||||speech-a||alex');
  });

  it('describes every supported voice reference scope', () => {
    expect(
      describeAudioVoiceRef({ scope: 'model_preset', voiceId: 'alex' }),
    ).toBe('alex');
    expect(describeAudioVoiceRef({ scope: 'project_narrator' })).toBe(
      '项目解说人',
    );
    expect(
      describeAudioVoiceRef({ scope: 'user_custom', voiceId: 'voice-a' }),
    ).toBe('voice-a');
    expect(
      describeAudioVoiceRef({
        scope: 'character_default',
        characterName: '林夏',
      }),
    ).toBe('林夏（默认声线）');
    expect(
      describeAudioVoiceRef({
        scope: 'character_age_group',
        characterName: '林夏',
        slot: '青年',
      }),
    ).toBe('林夏（青年）');
    expect(
      describeAudioVoiceRef({ scope: 'identity', identityId: 'identity-a' }),
    ).toBe('identity-a（自有声线）');
    expect(
      describeAudioVoiceRef({
        scope: 'identity_resolved',
        identityId: 'identity-a',
      }),
    ).toBe('identity-a（解析后）');
  });
});
