// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  audioEmotionPromptSupported,
  audioModelOptionsForMode,
  audioPresetVoiceOptions,
  audioSpeechModelOptions,
  audioVoiceDesignConfig,
  audioVoiceDesignModelOptions,
  resolveAudioModelSelector,
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
  it('leaves ambiguous model defaults unselected', () => {
    const options = [
      { value: 'model-a', isDefault: true },
      { value: 'model-b', isDefault: true },
    ];

    expect(resolveAudioModelSelector(options, 'model-b')).toBe('model-b');
    expect(resolveAudioModelSelector(options, 'missing')).toBe('');
    expect(resolveAudioModelSelector(options, '')).toBe('');
    expect(
      resolveAudioModelSelector(
        [
          { value: 'model-a', isDefault: false },
          { value: 'model-b', isDefault: true },
        ],
        '',
      ),
    ).toBe('model-b');
    expect(
      resolveAudioModelSelector([{ value: 'only-model' }], undefined),
    ).toBe('only-model');
  });

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

  it('projects preset voices only from the model voice enum', () => {
    expect(
      audioPresetVoiceOptions({
        parameterSchema: {
          properties: {
            voice: {
              enum: ['alex', 'anna', 'alex', ''],
              default: 'alex',
              'x-enum-labels': ['Alex', 'Anna'],
            },
          },
        },
      }),
    ).toEqual([
      { value: 'alex', label: 'Alex', isDefault: true },
      { value: 'anna', label: 'Anna', isDefault: false },
    ]);
    expect(audioPresetVoiceOptions({ parameterSchema: {} })).toEqual([]);
  });

  it('derives enum, custom, optional, and voice-free speech contracts from each provider schema', () => {
    const makeSpeechItem = (
      code: string,
      parameterSchema: Record<string, unknown>,
    ): AudioCatalogItem => ({
      ...item(code, ['SPEECH']),
      capabilities: {
        supportedModes: ['SPEECH'],
        routeSelector: `byok:provider:${code}`,
      },
      parameterSchema,
    });
    expect(
      audioSpeechModelOptions([
        makeSpeechItem('enum', {
          required: ['voice'],
          properties: { voice: { enum: ['alloy'], default: 'alloy' } },
        }),
        makeSpeechItem('custom-required', {
          required: ['voice'],
          properties: { voice: { type: 'string' } },
        }),
        makeSpeechItem('custom-optional', {
          properties: { voice: { type: 'string' } },
        }),
        makeSpeechItem('voice-free', {
          properties: { response_format: { enum: ['mp3'] } },
        }),
      ]).map(
        ({ value, acceptsVoice, allowsCustomVoice, requiresVoice }) => ({
          value,
          acceptsVoice,
          allowsCustomVoice,
          requiresVoice,
        }),
      ),
    ).toEqual([
      {
        value: 'byok:provider:enum',
        acceptsVoice: true,
        allowsCustomVoice: false,
        requiresVoice: true,
      },
      {
        value: 'byok:provider:custom-required',
        acceptsVoice: true,
        allowsCustomVoice: true,
        requiresVoice: true,
      },
      {
        value: 'byok:provider:custom-optional',
        acceptsVoice: true,
        allowsCustomVoice: true,
        requiresVoice: false,
      },
      {
        value: 'byok:provider:voice-free',
        acceptsVoice: false,
        allowsCustomVoice: false,
        requiresVoice: false,
      },
    ]);
  });

  it('enables emotion input only from an explicit catalog capability', () => {
    expect(
      audioEmotionPromptSupported({
        capabilities: {},
        parameterSchema: {
          properties: { emotion_prompt: { type: 'string' } },
        },
      }),
    ).toBe(true);
    expect(
      audioEmotionPromptSupported({
        capabilities: { supportsEmotionPrompt: true },
        parameterSchema: {},
      }),
    ).toBe(true);
    expect(
      audioEmotionPromptSupported({
        capabilities: {},
        parameterSchema: { properties: { voice: { type: 'string' } } },
      }),
    ).toBe(false);
  });

  it('projects the canonical voice-design form from the catalog schema', () => {
    expect(
      audioVoiceDesignConfig({
        parameterSchema: {
          type: 'object',
          properties: {
            voice_prompt: { type: 'string', maxLength: 2048 },
            preview_text: { type: 'string', maxLength: 1024 },
            preferred_name: { type: 'string', default: 'custom_voice' },
            language: {
              type: 'string',
              enum: ['zh', 'en', 'ja'],
              default: 'zh',
            },
            sample_rate: {
              type: 'integer',
              enum: [8000, 16000, 24000, 48000],
              default: 24000,
            },
            response_format: {
              type: 'string',
              enum: ['pcm', 'wav', 'mp3', 'opus'],
              default: 'wav',
            },
          },
        },
      }),
    ).toEqual({
      promptMinLength: 1,
      promptMaxLength: 2048,
      previewTextMinLength: 1,
      previewTextMaxLength: 1024,
      preferredName: 'custom_voice',
      languages: ['zh', 'en', 'ja'],
      defaultLanguage: 'zh',
      sampleRates: [8000, 16000, 24000, 48000],
      defaultSampleRate: 24000,
      responseFormats: ['wav', 'mp3'],
      defaultResponseFormat: 'wav',
    });
  });

  it('does not invent a voice-design form when the catalog schema is incomplete', () => {
    expect(
      audioVoiceDesignConfig({
        parameterSchema: {
          properties: {
            voice_prompt: { maxLength: 2048 },
          },
        },
      }),
    ).toBeNull();
  });

  it('preserves cloud and BYOK route selectors in voice-design options', () => {
    const parameterSchema = {
      properties: {
        voice_prompt: { maxLength: 2048 },
        preview_text: { maxLength: 1024 },
        language: { enum: ['zh'], default: 'zh' },
        sample_rate: { enum: [24000], default: 24000 },
        response_format: { enum: ['wav'], default: 'wav' },
      },
    };
    expect(
      audioVoiceDesignModelOptions([
        {
          ...item('cloud-model', ['VOICE_DESIGN']),
          capabilities: {
            supportedModes: ['VOICE_DESIGN'],
            routeSelector: 'cloud:cloud-model',
          },
          parameterSchema,
          isDefault: true,
        },
        {
          ...item('byok-model', ['VOICE_DESIGN']),
          capabilities: {
            supportedModes: ['VOICE_DESIGN'],
            routeSelector: 'byok:provider-a:byok-model',
          },
          parameterSchema,
        },
      ]).map(({ value, label, isDefault }) => ({ value, label, isDefault })),
    ).toEqual([
      {
        value: 'cloud:cloud-model',
        label: 'Model cloud-model',
        isDefault: true,
      },
      {
        value: 'byok:provider-a:byok-model',
        label: 'Model byok-model',
        isDefault: false,
      },
    ]);
  });
});
