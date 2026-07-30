// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';

import {
  filterAudioUpstreamTextContents,
  isAudioSubmitDisabled,
  musicBillingSecondsFromMs,
  resolveAudioMusicSettings,
  resolveAudioVoiceSettings,
} from './audioOperationsPanelModel';

describe('audioOperationsPanelModel', () => {
  it('projects music defaults and explicit settings', () => {
    expect(resolveAudioMusicSettings({ audioUrl: null })).toEqual({
      musicLengthMs: 30_000,
      forceInstrumental: true,
      respectSectionsDurations: true,
    });
    expect(
      resolveAudioMusicSettings({
        audioUrl: null,
        musicLengthMs: 90_000,
        forceInstrumental: false,
        respectSectionsDurations: false,
      }),
    ).toEqual({
      musicLengthMs: 90_000,
      forceInstrumental: false,
      respectSectionsDurations: false,
    });
  });

  it('rounds music billing up to whole seconds with a one-second floor', () => {
    expect(musicBillingSecondsFromMs(0)).toBe(1);
    expect(musicBillingSecondsFromMs(-500)).toBe(1);
    expect(musicBillingSecondsFromMs(30_001)).toBe(31);
  });

  it('projects voice display fallbacks without inventing a stored voice', () => {
    expect(resolveAudioVoiceSettings({ audioUrl: null })).toEqual({
      voiceLabel: '加载中…',
      voiceLanguage: '',
      currentRef: { scope: 'project_narrator' },
    });
    expect(
      resolveAudioVoiceSettings({
        audioUrl: null,
        voiceLabel: '林夏',
        voiceLanguage: '中文',
        voiceRef: { scope: 'user_custom', voiceId: 'voice-a' },
      }),
    ).toEqual({
      voiceLabel: '林夏',
      voiceLanguage: '中文',
      currentRef: { scope: 'user_custom', voiceId: 'voice-a' },
    });
  });

  it('keeps only non-empty upstream text and derives submit availability', () => {
    const text = {
      nodeId: 'text-a',
      nodeType: CANVAS_NODE_TYPES.textAnnotation,
      text: ' 旁白 ',
    };
    const image = {
      nodeId: 'image-a',
      nodeType: CANVAS_NODE_TYPES.imageEdit,
      imageUrl: 'image.png',
    };

    expect(
      filterAudioUpstreamTextContents([
        text,
        { ...text, nodeId: 'blank', text: '   ' },
        image,
      ]),
    ).toEqual([text]);
    expect(isAudioSubmitDisabled(false, '')).toBe(true);
    expect(isAudioSubmitDisabled(false, '旁白')).toBe(false);
    expect(isAudioSubmitDisabled(true, '旁白')).toBe(true);
  });
});
