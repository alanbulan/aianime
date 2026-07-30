// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type { CanvasAudioReference } from './audioVoiceCatalog';
import {
  customVoiceReferences,
  filterCustomVoiceReferences,
  filterLibraryVoiceReferences,
  isCurrentVoiceReference,
  paginateVoiceReferences,
  projectCustomVoicePick,
  projectLibraryVoicePick,
  resolveVoicePaginationJump,
  sanitizeVoicePaginationInput,
  voiceCloneFileStem,
  voiceCloneFileValidationError,
  voiceCloneUploadError,
  voicePaginationWindow,
} from './voiceSelectionModel';

function reference(
  id: string,
  scope: CanvasAudioReference['ref']['scope'] = 'user_custom',
): CanvasAudioReference {
  return {
    ref: {
      scope,
      voiceId: scope === 'user_custom' ? id : undefined,
      characterName: scope === 'character_default' ? id : undefined,
    },
    label: `Voice ${id}`,
    language: id === 'zh' ? '中文' : 'English',
    gender: null,
    previewUrl: null,
  };
}

describe('voiceSelectionModel', () => {
  it('validates clone file extension, MIME, and size before upload', () => {
    expect(
      voiceCloneFileValidationError({
        name: 'voice.WAV',
        type: '',
        size: 1024,
      }),
    ).toBeNull();
    expect(
      voiceCloneFileValidationError({
        name: 'voice.webm',
        type: 'video/webm',
        size: 1024,
      }),
    ).toContain('请选择音频文件');
    expect(
      voiceCloneFileValidationError({
        name: 'voice.mp3',
        type: 'audio/mpeg',
        size: 6 * 1024 * 1024,
      }),
    ).toContain('当前 6.0MB');
    expect(voiceCloneFileStem('voice.final.wav')).toBe('voice.final');
  });

  it('maps network upload errors to the existing readable message', () => {
    expect(voiceCloneUploadError(new Error('Network error while sending'))).toContain(
      '网络中断',
    );
    expect(voiceCloneUploadError(new Error('voice rejected'))).toBe(
      'voice rejected',
    );
    expect(voiceCloneUploadError(null)).toBe('上传失败');
  });

  it('filters the full catalog and custom catalog by their existing fields', () => {
    const character = reference('林夏', 'character_default');
    const custom = reference('voice-custom');
    const chinese = reference('zh');
    const items = [character, custom, chinese];

    expect(filterLibraryVoiceReferences(items, '林夏')).toEqual([character]);
    expect(filterLibraryVoiceReferences(items, '中文')).toEqual([chinese]);
    expect(customVoiceReferences(items)).toEqual([custom, chinese]);
    expect(filterCustomVoiceReferences([custom, chinese], 'custom')).toEqual([
      custom,
    ]);
  });

  it('paginates at twenty items and keeps the current page in range', () => {
    const items = Array.from({ length: 45 }, (_, index) =>
      reference(`voice-${index + 1}`),
    );

    expect(paginateVoiceReferences(items, 4)).toMatchObject({
      total: 45,
      totalPages: 3,
      page: 3,
    });
    expect(paginateVoiceReferences(items, 2).items).toHaveLength(20);
    expect(voicePaginationWindow(5, 10)).toEqual([
      1,
      'ellipsis',
      4,
      5,
      6,
      'ellipsis',
      10,
    ]);
  });

  it('sanitizes and clamps pagination jump input', () => {
    expect(sanitizeVoicePaginationInput('p12x')).toBe('12');
    expect(resolveVoicePaginationJump('12', 8)).toBe(8);
    expect(resolveVoicePaginationJump('', 8)).toBe(1);
  });

  it('projects library and custom picks without losing voice ids', () => {
    const library = reference('voice-a');
    const unlabeled = { ...library, label: null };

    expect(projectLibraryVoicePick(unlabeled)).toEqual({
      ref: library.ref,
      label: 'voice-a',
      language: 'English',
    });
    expect(projectCustomVoicePick(unlabeled)).toEqual({
      ref: { scope: 'user_custom', voiceId: 'voice-a' },
      label: 'voice-a',
      language: 'English',
    });
    expect(
      isCurrentVoiceReference(
        { scope: 'user_custom', voiceId: 'voice-a' },
        library.ref,
      ),
    ).toBe(true);
  });
});
