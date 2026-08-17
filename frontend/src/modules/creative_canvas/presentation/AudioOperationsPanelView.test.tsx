// Copyright (c) 2026 AI anime
import { getByUiTooltip } from "@/__tests__/helpers/ui-tooltip-query";
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AudioOperationsPanelController } from './useAudioOperationsPanelController';
import { AudioOperationsPanelView } from './AudioOperationsPanelView';

vi.mock('./VoiceSelectionModal', () => ({
  VoiceSelectionModal: ({
    projectId,
    open,
    onClose,
    onPick,
  }: {
    projectId: string;
    open: boolean;
    onClose: () => void;
    onPick: (result: {
      ref: { scope: 'project_narrator' };
      label: string;
    }) => void;
  }) =>
    open ? (
      <div>
        <span>voice-project:{projectId}</span>
        <button type="button" onClick={onClose}>
          关闭模拟音色
        </button>
        <button
          type="button"
          onClick={() =>
            onPick({
              ref: { scope: 'project_narrator' },
              label: '项目解说人',
            })
          }
        >
          选择模拟音色
        </button>
      </div>
    ) : null,
}));

function controller(
  overrides: Partial<AudioOperationsPanelController> = {},
): AudioOperationsPanelController {
  return {
    projectId: 'project-a',
    nodeId: 'audio-a',
    isMusic: false,
    panelExpanded: false,
    collapsePanel: vi.fn(),
    togglePanelExpanded: vi.fn(),
    showVoiceSettings: false,
    toggleVoiceSettings: vi.fn(),
    showMusicSettings: false,
    toggleMusicSettings: vi.fn(),
    isGenerating: false,
    isTranslating: false,
    submitDisabled: false,
    submit: vi.fn(async () => undefined),
    translate: vi.fn(async () => undefined),
    audioCostDisplay: '2 积分',
    audioModels: [
      {
        value: 'audio-speech-1',
        label: 'Speech Model',
        supportedModes: ['speech'],
      },
    ],
    selectedModel: 'audio-speech-1',
    modelCatalogLoading: false,
    modelCatalogError: '',
    setSelectedModel: vi.fn(),
    text: '原文',
    textDraft: '原文',
    changeTextDraft: vi.fn(),
    startTextComposition: vi.fn(),
    finishTextComposition: vi.fn(),
    emotionDraft: '平静',
    changeEmotionDraft: vi.fn(),
    startEmotionComposition: vi.fn(),
    finishEmotionComposition: vi.fn(),
    upstreamTextContents: [],
    detachUpstream: vi.fn(),
    musicSettings: {
      musicLengthMs: 30_000,
      forceInstrumental: true,
      respectSectionsDurations: true,
    },
    setMusicLengthMs: vi.fn(),
    setForceInstrumental: vi.fn(),
    setRespectSectionsDurations: vi.fn(),
    voiceSettings: {
      voiceLabel: 'Voice A',
      voiceLanguage: '中文',
      currentRef: { scope: 'user_custom', voiceId: 'voice-a' },
    },
    voiceModalOpen: false,
    openVoiceModal: vi.fn(),
    closeVoiceModal: vi.fn(),
    pickVoice: vi.fn(),
    copyState: 'idle',
    copyVoiceReference: vi.fn(async () => undefined),
    ...overrides,
  } as AudioOperationsPanelController;
}

describe('AudioOperationsPanelView', () => {
  it('renders speech controls and forwards draft, translate, settings, and submit commands', () => {
    const changeTextDraft = vi.fn();
    const startTextComposition = vi.fn();
    const finishTextComposition = vi.fn();
    const changeEmotionDraft = vi.fn();
    const toggleVoiceSettings = vi.fn();
    const translate = vi.fn();
    const submit = vi.fn();
    render(
      <AudioOperationsPanelView
        controller={controller({
          changeTextDraft,
          startTextComposition,
          finishTextComposition,
          changeEmotionDraft,
          toggleVoiceSettings,
          translate,
          submit,
        })}
      />,
    );

    const text = screen.getByDisplayValue('原文');
    fireEvent.change(text, { target: { value: '新文本' } });
    fireEvent.compositionStart(text);
    fireEvent.compositionEnd(text, { target: { value: '组合文本' } });
    expect(changeTextDraft).toHaveBeenCalledWith('新文本');
    expect(startTextComposition).toHaveBeenCalledOnce();
    expect(finishTextComposition).toHaveBeenCalledWith('组合文本');

    fireEvent.change(screen.getByDisplayValue('平静'), {
      target: { value: '紧张' },
    });
    expect(changeEmotionDraft).toHaveBeenCalledWith('紧张');
    fireEvent.click(getByUiTooltip('翻译（中英文互译）'));
    fireEvent.click(getByUiTooltip('音色设置'));
    fireEvent.click(getByUiTooltip('生成'));
    expect(translate).toHaveBeenCalledOnce();
    expect(toggleVoiceSettings).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
  });

  it('renders music settings and forwards select and switch commands', async () => {
    const user = userEvent.setup();
    const setMusicLengthMs = vi.fn();
    const setForceInstrumental = vi.fn();
    const setRespectSectionsDurations = vi.fn();
    const toggleMusicSettings = vi.fn();
    render(
      <AudioOperationsPanelView
        controller={controller({
          isMusic: true,
          showMusicSettings: true,
          text: '音乐描述',
          textDraft: '音乐描述',
          setMusicLengthMs,
          setForceInstrumental,
          setRespectSectionsDurations,
          toggleMusicSettings,
        })}
      />,
    );

    expect(screen.queryByText('语气词')).not.toBeInTheDocument();
    fireEvent.click(getByUiTooltip('高级设置'));
    expect(toggleMusicSettings).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '音乐时长' }));
    await user.click(await screen.findByRole('option', { name: '1分钟' }));
    expect(setMusicLengthMs).toHaveBeenCalledWith(60_000);
    fireEvent.click(screen.getByRole('switch', { name: '强制纯音乐' }));
    fireEvent.click(screen.getByRole('switch', { name: '遵守段落时长' }));
    expect(setForceInstrumental).toHaveBeenCalledWith(false);
    expect(setRespectSectionsDurations).toHaveBeenCalledWith(false);
  });

  it('renders voice state and forwards copy, open, close, and pick commands', () => {
    const copyVoiceReference = vi.fn();
    const openVoiceModal = vi.fn();
    const closeVoiceModal = vi.fn();
    const pickVoice = vi.fn();
    render(
      <AudioOperationsPanelView
        controller={controller({
          showVoiceSettings: true,
          voiceModalOpen: true,
          copyVoiceReference,
          openVoiceModal,
          closeVoiceModal,
          pickVoice,
        })}
      />,
    );

    expect(screen.getByText('Voice A')).toBeInTheDocument();
    expect(screen.getByText('中文')).toBeInTheDocument();
    expect(screen.getByText('voice-project:project-a')).toBeInTheDocument();
    fireEvent.click(getByUiTooltip('复制声线引用'));
    fireEvent.click(getByUiTooltip('切换音色'));
    fireEvent.click(screen.getByRole('button', { name: '关闭模拟音色' }));
    fireEvent.click(screen.getByRole('button', { name: '选择模拟音色' }));
    expect(copyVoiceReference).toHaveBeenCalledOnce();
    expect(openVoiceModal).toHaveBeenCalledOnce();
    expect(closeVoiceModal).toHaveBeenCalledOnce();
    expect(pickVoice).toHaveBeenCalledWith({
      ref: { scope: 'project_narrator' },
      label: '项目解说人',
    });
  });
});
