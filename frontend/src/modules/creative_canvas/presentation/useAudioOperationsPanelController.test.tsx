// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import {
  createUseAudioOperationsPanelController,
  type AudioOperationsPanelStore,
  type AudioOperationsPanelStoreHook,
} from './useAudioOperationsPanelController';

const mocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  generate: vi.fn(),
  effectivePrompt: '可生成文本',
  isGenerating: false,
  upstreamContents: [] as Array<{
    nodeId: string;
    nodeType: string;
    text?: string;
  }>,
  detachUpstream: vi.fn(),
  useAudioGeneration: vi.fn(),
  creditCost: vi.fn(),
  modelAccess: vi.fn(),
  translate: vi.fn(),
}));

vi.mock('@/modules/model_usage/public', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/modules/model_usage/public')
  >();
  return {
    ...actual,
    useGenerationCreditCost: (...args: unknown[]) => mocks.creditCost(...args),
    useCommercialModelAccessStatus: (...args: unknown[]) => mocks.modelAccess(...args),
  };
});

const useStore = ((
  selector: (state: AudioOperationsPanelStore) => unknown,
) => selector({ updateNodeData: mocks.updateNodeData })) as unknown as AudioOperationsPanelStoreHook;

const useAudioOperationsPanelController =
  createUseAudioOperationsPanelController({
    useStore,
    useAudioGeneration: (options) => mocks.useAudioGeneration(options),
    useUpstreamContents: () => mocks.upstreamContents,
    useDetachUpstream: () => mocks.detachUpstream,
    translateCanvasText: (...args: unknown[]) => mocks.translate(...args),
  });

describe('useAudioOperationsPanelController', () => {
  beforeEach(() => {
    mocks.updateNodeData.mockReset();
    mocks.generate.mockReset();
    mocks.effectivePrompt = '可生成文本';
    mocks.isGenerating = false;
    mocks.upstreamContents = [];
    mocks.detachUpstream.mockReset();
    mocks.useAudioGeneration.mockReset().mockImplementation(() => ({
      generate: mocks.generate,
      effectivePrompt: mocks.effectivePrompt,
      isGenerating: mocks.isGenerating,
    }));
    mocks.creditCost.mockReset().mockReturnValue({
      data: { data: { display: '2 积分' } },
    });
    mocks.modelAccess.mockReset().mockReturnValue({
      data: {
        mode: 'mixed',
        allowsCustomModels: false,
        gatewayOrigin: 'http://localhost',
        byokConfigured: false,
        byokProviders: [],
        cloudModelAssignments: [
          {
            modelId: 'audio-voice-clone-1',
            role: 'AUDIO_VOICE_CLONE',
            priority: 100,
            enabled: true,
          },
          {
            modelId: 'audio-music-1',
            role: 'AUDIO_MUSIC',
            priority: 100,
            enabled: true,
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    mocks.translate.mockReset().mockResolvedValue({ translatedText: 'Hello' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('projects music settings, billing quantity, references, and commands', () => {
    mocks.upstreamContents = [
      {
        nodeId: 'text-a',
        nodeType: CANVAS_NODE_TYPES.textAnnotation,
        text: '上游文本',
      },
      {
        nodeId: 'blank',
        nodeType: CANVAS_NODE_TYPES.textAnnotation,
        text: '   ',
      },
    ];
    const { result } = renderHook(() =>
      useAudioOperationsPanelController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        nodeId: 'audio-a',
        data: {
          audioUrl: null,
          audioKind: 'music',
          model: 'legacy-node-model',
          musicLengthMs: 30_001,
        },
      }),
    );

    expect(mocks.creditCost).toHaveBeenCalledWith(
      'freezone_audio_music',
      'audio-music-1',
      { surface: 'canvas', quantity: 31 },
    );
    expect(mocks.useAudioGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-a',
        nodeId: 'audio-a',
      }),
    );
    expect(result.current.upstreamTextContents).toHaveLength(1);
    expect(result.current.submitDisabled).toBe(false);
    expect(result.current.routedModelLabel).toBe('云端 · audio-music-1');
    act(() => result.current.toggleMusicSettings());
    expect(result.current.showMusicSettings).toBe(true);
    act(() => result.current.setMusicLengthMs(60_000));
    act(() => result.current.setForceInstrumental(false));
    act(() => result.current.setRespectSectionsDurations(false));
    expect(mocks.updateNodeData.mock.calls).toEqual([
      ['audio-a', { musicLengthMs: 60_000 }],
      ['audio-a', { forceInstrumental: false }],
      ['audio-a', { respectSectionsDurations: false }],
    ]);
  });

  it('keeps IME drafts local until composition ends', () => {
    const { result } = renderHook(() =>
      useAudioOperationsPanelController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        nodeId: 'audio-a',
        data: {
          audioUrl: null,
          model: 'audio-speech-1',
          text: '原文',
          emotionPrompt: '平静',
        },
      }),
    );

    act(() => result.current.startTextComposition());
    act(() => result.current.changeTextDraft('候选'));
    expect(result.current.textDraft).toBe('候选');
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
    act(() => result.current.finishTextComposition('候选完成'));
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith('audio-a', {
      text: '候选完成',
    });

    mocks.updateNodeData.mockClear();
    act(() => result.current.startEmotionComposition());
    act(() => result.current.changeEmotionDraft('紧'));
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
    act(() => result.current.finishEmotionComposition('紧张'));
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith('audio-a', {
      emotionPrompt: '紧张',
    });
  });

  it('translates the stored local text through the Canvas use case', async () => {
    const { result } = renderHook(() =>
      useAudioOperationsPanelController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        nodeId: 'audio-a',
        data: { audioUrl: null, model: 'audio-speech-1', text: ' 你好 ' },
      }),
    );

    await act(async () => result.current.translate());

    expect(mocks.translate).toHaveBeenCalledWith({
      projectId: 'project-a',
      text: '你好',
      nodeType: 'audio',
      canvasId: 'canvas-a',
      nodeId: 'audio-a',
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('audio-a', {
      text: 'Hello',
    });
    expect(result.current.isTranslating).toBe(false);
  });

  it('copies and replaces the selected voice through one controller', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const { result, unmount } = renderHook(() =>
      useAudioOperationsPanelController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        nodeId: 'audio-a',
        data: {
          audioUrl: null,
          model: 'audio-speech-1',
          voiceLabel: 'Voice A',
          voiceRef: { scope: 'user_custom', voiceId: 'voice-a' },
        },
      }),
    );

    act(() => result.current.toggleVoiceSettings());
    act(() => result.current.openVoiceModal());
    await act(async () => result.current.copyVoiceReference());
    expect(writeText).toHaveBeenCalledWith('voice-a');
    expect(result.current.copyState).toBe('success');

    act(() =>
      result.current.pickVoice({
        ref: { scope: 'project_narrator' },
        label: '项目解说人',
      }),
    );
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith('audio-a', {
      voiceRef: { scope: 'project_narrator' },
      voiceLabel: '项目解说人',
      voiceLanguage: '',
    });
    expect(result.current.voiceModalOpen).toBe(false);
    unmount();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('resets voice-local state when its child panel is hidden', async () => {
    const { result } = renderHook(() =>
      useAudioOperationsPanelController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        nodeId: 'audio-a',
        data: {
          audioUrl: null,
          audioKind: 'speech',
          model: 'audio-speech-1',
        },
      }),
    );

    act(() => result.current.toggleVoiceSettings());
    act(() => result.current.openVoiceModal());
    expect(result.current.voiceModalOpen).toBe(true);
    act(() => result.current.toggleVoiceSettings());

    await waitFor(() => expect(result.current.voiceModalOpen).toBe(false));
    expect(result.current.copyState).toBe('idle');
  });
});
