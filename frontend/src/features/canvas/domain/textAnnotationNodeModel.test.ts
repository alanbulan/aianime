// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  hasTextAnnotationUserContent,
  isCompactTextAnnotationView,
  resolveTextAnnotationMode,
  resolveTextAnnotationNodeSize,
  resolveTextAnnotationUpstreamImageUrl,
} from './textAnnotationNodeModel';

describe('textAnnotationNodeModel', () => {
  it('accepts only persisted text-node modes', () => {
    expect(resolveTextAnnotationMode('writing')).toBe('writing');
    expect(resolveTextAnnotationMode('textToVideo')).toBe('textToVideo');
    expect(resolveTextAnnotationMode('imageToPrompt')).toBe('imageToPrompt');
    expect(resolveTextAnnotationMode('textToMusic')).toBe('textToMusic');
    expect(resolveTextAnnotationMode('textToMusicGen')).toBe(
      'textToMusicGen',
    );
    expect(resolveTextAnnotationMode('removed-mode')).toBe('writing');
    expect(resolveTextAnnotationMode(null)).toBe('writing');
  });

  it('projects compact modes and size floors', () => {
    expect(isCompactTextAnnotationView('writing', false)).toBe(false);
    expect(isCompactTextAnnotationView('textToVideo', false)).toBe(true);
    expect(isCompactTextAnnotationView('imageToPrompt', false)).toBe(true);
    expect(isCompactTextAnnotationView('writing', true)).toBe(true);

    expect(
      resolveTextAnnotationNodeSize({ compact: false }),
    ).toMatchObject({ width: 440, height: 240, minHeight: 240 });
    expect(
      resolveTextAnnotationNodeSize({ compact: true }),
    ).toMatchObject({ width: 440, height: 320, minHeight: 240 });
    expect(
      resolveTextAnnotationNodeSize({
        width: 120.4,
        height: 80.2,
        compact: true,
      }),
    ).toMatchObject({ width: 380, height: 240 });
  });

  it('keeps image, preview, and reference URL precedence', () => {
    expect(
      resolveTextAnnotationUpstreamImageUrl({
        imageUrl: '/image.png',
        previewImageUrl: '/preview.webp',
        referenceImageUrl: '/reference.jpg',
      }),
    ).toBe('/image.png');
    expect(
      resolveTextAnnotationUpstreamImageUrl({
        imageUrl: '',
        previewImageUrl: '/preview.webp',
        referenceImageUrl: '/reference.jpg',
      }),
    ).toBe('/preview.webp');
    expect(
      resolveTextAnnotationUpstreamImageUrl({
        referenceImageUrl: '/reference.jpg',
      }),
    ).toBe('/reference.jpg');
    expect(resolveTextAnnotationUpstreamImageUrl({})).toBeNull();
  });

  it('does not treat the localized placeholder as user content', () => {
    expect(hasTextAnnotationUserContent(' 正文 ', '请输入内容')).toBe(true);
    expect(hasTextAnnotationUserContent('', '请输入内容')).toBe(false);
    expect(
      hasTextAnnotationUserContent(' 请输入内容 ', '请输入内容'),
    ).toBe(false);
  });
});
