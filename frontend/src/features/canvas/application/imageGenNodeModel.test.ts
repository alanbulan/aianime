// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  hasEffectiveImageGenPrompt,
  imageGenAlbumUrls,
  resolveImageGenEffectivePrompt,
  resolveImageGenModel,
  resolveImageGenReferencePreviewPosition,
  resolveNearestImageGenAspectOption,
  snapImageGenAspectRatio,
} from './imageGenNodeModel';

describe('imageGenNodeModel', () => {
  it('reconciles an unavailable persisted model with the first live model', () => {
    const models = [
      { id: 'live-model', apiModel: 'live_api_model' },
      { id: 'second-model', apiModel: 'second_api_model' },
    ];

    expect(resolveImageGenModel(models, 'missing-model')).toBe(models[0]);
    expect(resolveImageGenModel(models, 'second-model')).toBe(models[1]);
  });

  it('uses untouched upstream text as the prompt for inline source nodes', () => {
    expect(
      resolveImageGenEffectivePrompt({
        prompt: '',
        upstreamText: '上游场景描述',
        inlineUpstreamText: true,
        hasUserEditedPrompt: false,
      }),
    ).toBe('上游场景描述');
    expect(
      hasEffectiveImageGenPrompt({
        prompt: '',
        upstreamText: '上游场景描述',
        inlineUpstreamText: true,
        hasUserEditedPrompt: true,
      }),
    ).toBe(false);
  });

  it('combines upstream and local prompts for ordinary nodes', () => {
    expect(
      resolveImageGenEffectivePrompt({
        prompt: '本地补充',
        upstreamText: '上游描述',
        inlineUpstreamText: false,
        hasUserEditedPrompt: true,
      }),
    ).toBe('上游描述\n\n本地补充');
  });

  it('filters invalid album values without changing result order', () => {
    expect(imageGenAlbumUrls(['a.png', null, '', 'b.png', 3])).toEqual([
      'a.png',
      'b.png',
    ]);
  });

  it('normalizes generated image ratios to supported options', () => {
    expect(snapImageGenAspectRatio('43:24')).toBe('16:9');
    expect(resolveNearestImageGenAspectOption('7:3').value).toBe('21:9');
  });

  it('keeps the reference preview inside the viewport', () => {
    const rect = { left: 980, top: 50 };

    expect(resolveImageGenReferencePreviewPosition(rect, 1000)).toEqual({
      left: 772,
      top: 8,
      size: 220,
    });
  });
});
