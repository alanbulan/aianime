// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  filterAudioUpstreamTextContents,
  isAudioSubmitDisabled,
  resolveAudioMusicSettings,
  resolveAudioVoiceSettings,
} from './audioOperationsPanelModel';

describe('audioOperationsPanelModel', () => {
  it('projects music defaults and explicit settings', () => {
    expect(resolveAudioMusicSettings({})).toEqual({
      musicLengthMs: 30_000,
      forceInstrumental: true,
      respectSectionsDurations: true,
    });
    expect(
      resolveAudioMusicSettings({
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

  it('projects voice display fallbacks without inventing a stored voice', () => {
    expect(resolveAudioVoiceSettings({})).toEqual({
      voiceLabel: '加载中…',
      voiceLanguage: '',
      currentRef: { scope: 'project_narrator' },
      generationMode: 'voiceClone',
      modeLabel: '参考音频克隆',
    });
    expect(
      resolveAudioVoiceSettings({
        voiceLabel: '林夏',
        voiceLanguage: '中文',
        voiceRef: { scope: 'user_custom', voiceId: 'voice-a' },
      }),
    ).toEqual({
      voiceLabel: '林夏',
      voiceLanguage: '中文',
      currentRef: { scope: 'user_custom', voiceId: 'voice-a' },
      generationMode: 'voiceClone',
      modeLabel: '参考音频克隆',
    });
    expect(
      resolveAudioVoiceSettings({
        voiceLabel: 'Alex',
        voiceRef: {
          scope: 'model_preset',
          modelId: 'speech-a',
          voiceId: 'alex',
        },
      }),
    ).toMatchObject({
      generationMode: 'speech',
      modeLabel: '预设音色',
    });
  });

  it('keeps only non-empty upstream text and derives submit availability', () => {
    const text = {
      nodeId: 'text-a',
      nodeType: 'textAnnotationNode',
      text: ' 旁白 ',
    };
    const image = {
      nodeId: 'image-a',
      nodeType: 'imageNode',
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
