// Copyright (c) 2026 AI anime
import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioNodeData } from '@/features/canvas/domain/canvasNodes';

import { useAudioNodeController } from './useAudioNodeController';

const mocks = vi.hoisted(() => ({
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  updateNodeInternals: vi.fn(),
  generate: vi.fn(async () => undefined),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  uploadCanvasAsset: vi.fn(),
  loadCanvasAudioReferences: vi.fn(),
  toastError: vi.fn(),
  translate: vi.fn((key: string) => key),
  taskState: {
    isGenerating: false,
    task: null as unknown,
  },
  isBoxSelecting: false,
  project: '',
  nodes: [] as Array<{ id: string; data: unknown }>,
}));

vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.translate }),
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError },
}));

vi.mock('@/features/canvas/canvasStore', () => {
  const useCanvasStore = Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({
      setSelectedNode: mocks.setSelectedNode,
      updateNodeData: mocks.updateNodeData,
      nodes: mocks.nodes,
    }),
    { getState: () => ({ nodes: mocks.nodes }) },
  );
  return { useCanvasStore };
});

vi.mock('@/features/canvas/hooks/useIsBoxSelecting', () => ({
  useIsBoxSelecting: () => mocks.isBoxSelecting,
}));

vi.mock('@/features/canvas/hooks/useNodeGenerationTaskState', () => ({
  useNodeGenerationTaskState: () => mocks.taskState,
}));

vi.mock('@/features/canvas/nodes/useAudioGeneration', () => ({
  useAudioGeneration: () => ({ generate: mocks.generate }),
}));

vi.mock('@/features/canvas/application/canvasServices', () => ({
  canvasEventBus: {
    subscribe: (type: string, handler: unknown) =>
      mocks.subscribe(type, handler),
  },
}));

vi.mock('@/features/canvas/application/imageData', () => ({
  resolveImageDisplayUrl: (url: string) => `resolved:${url}`,
}));

vi.mock('@/features/canvas/audioComposition', () => ({
  loadCanvasAudioReferences: (project: string) =>
    mocks.loadCanvasAudioReferences(project),
}));

vi.mock('@/features/canvas/composition', () => ({
  uploadCanvasAsset: (project: string, file: File, filename: string) =>
    mocks.uploadCanvasAsset(project, file, filename),
}));

vi.mock('@/features/freezone/public', () => ({
  hasMainlineContexts: (contexts: unknown) => Boolean(contexts),
}));

vi.mock('@/lib/url-params', () => ({
  readUrl: () => ({ project: mocks.project }),
}));

function data(patch: Partial<AudioNodeData> = {}): AudioNodeData {
  return {
    audioUrl: null,
    displayName: '音频节点',
    voiceRef: { scope: 'user_custom', voiceId: 'voice-1' },
    ...patch,
  };
}

function externalFileHandler() {
  return mocks.subscribe.mock.calls[0]?.[1] as (
    payload: { nodeId: string; file: File },
  ) => void;
}

function StrictModeWrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

describe('useAudioNodeController', () => {
  beforeEach(() => {
    mocks.setSelectedNode.mockReset();
    mocks.updateNodeData.mockReset();
    mocks.updateNodeInternals.mockReset();
    mocks.generate.mockReset().mockResolvedValue(undefined);
    mocks.subscribe.mockReset().mockReturnValue(mocks.unsubscribe);
    mocks.unsubscribe.mockReset();
    mocks.uploadCanvasAsset.mockReset();
    mocks.loadCanvasAudioReferences.mockReset();
    mocks.toastError.mockReset();
    mocks.translate.mockClear();
    mocks.taskState.isGenerating = false;
    mocks.taskState.task = null;
    mocks.isBoxSelecting = false;
    mocks.project = '';
    mocks.nodes.splice(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('projects node state, size, media, and store commands', async () => {
    const nodeData = data({
      audioUrl: '/voice.wav',
      durationMs: 1200,
      mainline_context: [{ id: 'context-a' }],
    });
    const { result } = renderHook(() => useAudioNodeController({
      id: 'audio-a',
      data: nodeData,
      selected: true,
      width: 200,
      height: 100,
    }));

    expect(result.current).toMatchObject({
      id: 'audio-a',
      selected: true,
      title: '音频节点',
      audioSource: 'resolved:/voice.wav',
      hasMainlineContext: true,
      hasGenerationError: false,
      showOperationsPanel: false,
      size: {
        width: 360,
        height: 190,
        minWidth: 360,
        minHeight: 190,
        maxWidth: 900,
        maxHeight: 360,
      },
    });
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('audio-a');

    act(() => result.current.select());
    act(() => result.current.rename('新标题'));
    expect(mocks.setSelectedNode).toHaveBeenCalledWith('audio-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('audio-a', {
      displayName: '新标题',
    });

    mocks.updateNodeData.mockClear();
    act(() => result.current.updateDuration(1200));
    act(() => result.current.updateDuration(2400));
    expect(mocks.updateNodeData).toHaveBeenCalledOnce();
    expect(mocks.updateNodeData).toHaveBeenCalledWith('audio-a', {
      durationMs: 2400,
    });

    await act(async () => {
      await result.current.retry();
    });
    expect(mocks.generate).toHaveBeenCalledOnce();
  });

  it('persists task failures and projects the stored error state', () => {
    mocks.taskState.task = { status: 'failed', error: '任务失败' };
    const { result } = renderHook(() => useAudioNodeController({
      id: 'audio-failed',
      data: data({
        generationError: '  旧错误  ',
        isGenerating: true,
      }),
      selected: true,
    }));

    expect(mocks.updateNodeData).toHaveBeenCalledWith('audio-failed', {
      generationError: '任务失败',
      isGenerating: false,
    });
    expect(result.current.generationError).toBe('旧错误');
    expect(result.current.hasGenerationError).toBe(true);
    expect(result.current.showOperationsPanel).toBe(true);
  });

  it('validates and uploads matching external audio files', async () => {
    mocks.project = 'project-upload-551';
    mocks.uploadCanvasAsset.mockResolvedValue({ url: '/uploaded/voice.m4a' });
    const { unmount } = renderHook(() => useAudioNodeController({
      id: 'audio-upload',
      data: data(),
    }));
    const handler = externalFileHandler();
    const wrongNodeFile = new File(['audio'], 'wrong.wav', {
      type: 'audio/wav',
    });
    const invalidFile = new File(['video'], 'clip.mp4', {
      type: 'video/mp4',
    });
    const audioFile = new File(['audio'], 'voice.M4A', { type: '' });

    act(() => handler({ nodeId: 'other-node', file: wrongNodeFile }));
    act(() => handler({ nodeId: 'audio-upload', file: invalidFile }));
    expect(mocks.uploadCanvasAsset).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'node.audio.uploadTypeError',
    );

    act(() => handler({ nodeId: 'audio-upload', file: audioFile }));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('audio-upload', {
      isUploading: true,
    });
    await waitFor(() => {
      expect(mocks.uploadCanvasAsset).toHaveBeenCalledWith(
        'project-upload-551',
        audioFile,
        'voice.M4A',
      );
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('audio-upload', {
      audioUrl: '/uploaded/voice.m4a',
      sourceFileName: 'voice.M4A',
      durationMs: null,
      isUploading: false,
    });

    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('clears the upload flag when an external upload fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.project = 'project-upload-failure-551';
    mocks.uploadCanvasAsset.mockRejectedValue(new Error('upload failed'));
    renderHook(() => useAudioNodeController({
      id: 'audio-upload-failed',
      data: data(),
    }));
    const audioFile = new File(['audio'], 'voice.wav', {
      type: 'audio/wav',
    });

    act(() => externalFileHandler()({
      nodeId: 'audio-upload-failed',
      file: audioFile,
    }));

    await waitFor(() => {
      expect(mocks.updateNodeData).toHaveBeenCalledWith(
        'audio-upload-failed',
        { isUploading: false },
      );
    });
  });

  it('initializes one default voice under StrictMode with a shared request', async () => {
    mocks.project = 'project-default-voice-551';
    const nodeData = data({ voiceRef: null });
    mocks.nodes.push({ id: 'audio-default', data: nodeData });
    mocks.loadCanvasAudioReferences.mockResolvedValue([{
      ref: { scope: 'character_default', characterName: '林夏' },
      label: '林夏默认音色',
      language: 'zh-CN',
      gender: null,
      previewUrl: null,
    }]);

    renderHook(() => useAudioNodeController({
      id: 'audio-default',
      data: nodeData,
    }), { wrapper: StrictModeWrapper });

    await waitFor(() => {
      expect(mocks.updateNodeData).toHaveBeenCalledWith('audio-default', {
        voiceRef: {
          scope: 'character_default',
          characterName: '林夏',
        },
        voiceLabel: '林夏默认音色',
        voiceLanguage: 'zh-CN',
      });
    });
    expect(mocks.loadCanvasAudioReferences).toHaveBeenCalledOnce();
    expect(mocks.loadCanvasAudioReferences).toHaveBeenCalledWith(
      'project-default-voice-551',
    );
  });

  it('does not rewrite an equivalent narrator fallback', async () => {
    mocks.project = 'project-equivalent-voice-551';
    const nodeData = data({
      voiceRef: { scope: 'project_narrator' },
      voiceLabel: '',
      voiceLanguage: '',
    });
    mocks.nodes.push({ id: 'audio-equivalent', data: nodeData });
    mocks.loadCanvasAudioReferences.mockResolvedValue([{
      ref: { scope: 'project_narrator' },
      label: null,
      language: null,
      gender: null,
      previewUrl: null,
    }]);

    renderHook(() => useAudioNodeController({
      id: 'audio-equivalent',
      data: nodeData,
    }));

    await waitFor(() => {
      expect(mocks.loadCanvasAudioReferences).toHaveBeenCalledOnce();
    });
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
  });
});
