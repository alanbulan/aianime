// Copyright (c) 2026 AI anime
import type { ChangeEvent } from 'react';
import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasAudioReference } from '@/modules/creative_canvas/public';

import { useVoiceSelectionModalController } from './useVoiceSelectionModalController';

const mocks = vi.hoisted(() => ({
  loadReferences: vi.fn(),
  createVoice: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/modules/creative_canvas/public', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/modules/creative_canvas/public')
  >();
  return {
    ...actual,
    loadCanvasAudioReferences: (project: string) =>
      mocks.loadReferences(project),
    createCanvasAudioVoice: (
      project: string,
      file: File,
      name?: string,
    ) => mocks.createVoice(project, file, name),
  };
});

vi.mock('sonner', () => ({
  toast: { error: (message: string) => mocks.toastError(message) },
}));

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
    language: '中文',
    gender: '女',
    previewUrl: null,
  };
}

function fileChangeEvent(file: File): ChangeEvent<HTMLInputElement> {
  return {
    target: {
      files: [file],
      value: 'selected-file',
    },
  } as unknown as ChangeEvent<HTMLInputElement>;
}

describe('useVoiceSelectionModalController', () => {
  beforeEach(() => {
    mocks.loadReferences.mockReset().mockResolvedValue([]);
    mocks.createVoice.mockReset().mockResolvedValue(undefined);
    mocks.toastError.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads references on open, projects both tabs, and closes on Escape', async () => {
    const onClose = vi.fn();
    const custom = reference('custom-a');
    const character = reference('林夏', 'character_default');
    mocks.loadReferences.mockResolvedValue([custom, character]);
    const { result } = renderHook(() =>
      useVoiceSelectionModalController({
        projectId: 'project-voice',
        open: true,
        onClose,
        currentRef: { scope: 'user_custom', voiceId: 'custom-a' },
        onPick: vi.fn(),
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.loadReferences).toHaveBeenCalledWith('project-voice');
    expect(result.current.libraryPage.total).toBe(2);
    expect(result.current.minePage.total).toBe(1);
    expect(result.current.mineRows[0]).toMatchObject({
      title: 'Voice custom-a',
      isActive: true,
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('filters references, resets pages on query changes, and commits jumps', async () => {
    mocks.loadReferences.mockResolvedValue(
      Array.from({ length: 45 }, (_, index) => reference(`voice-${index + 1}`)),
    );
    const { result } = renderHook(() =>
      useVoiceSelectionModalController({
        projectId: 'project-voice',
        open: true,
        onClose: vi.fn(),
        currentRef: { scope: 'project_narrator' },
        onPick: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.libraryPage.total).toBe(45));

    act(() => result.current.setLibraryPageNumber(3));
    expect(result.current.libraryPage.page).toBe(3);
    act(() => result.current.handleLibraryQueryChange('voice-2'));
    expect(result.current.libraryPage.page).toBe(1);
    expect(result.current.libraryPage.total).toBe(11);
    act(() => result.current.handleLibraryQueryChange(''));
    act(() => result.current.updateLibraryJumpValue('page 2'));
    expect(result.current.libraryJumpValue).toBe('2');
    act(() => result.current.commitLibraryJump());
    expect(result.current.libraryPage.page).toBe(2);
    expect(result.current.libraryJumpValue).toBe('');

    act(() => result.current.setTab('mine'));
    act(() => result.current.handleMineQueryChange('voice-3'));
    act(() => result.current.setMinePageNumber(2));
    act(() => result.current.setTab('library'));
    expect(result.current.libraryQuery).toBe('');
    expect(result.current.libraryPage.page).toBe(1);
    act(() => result.current.setTab('mine'));
    expect(result.current.mineQuery).toBe('');
    expect(result.current.minePage.page).toBe(1);
  });

  it('resets tab-local filters when the modal is reopened', async () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useVoiceSelectionModalController({
          projectId: 'project-voice',
          open,
          onClose: vi.fn(),
          currentRef: { scope: 'project_narrator' },
          onPick: vi.fn(),
        }),
      { initialProps: { open: true } },
    );
    await waitFor(() => expect(mocks.loadReferences).toHaveBeenCalledOnce());
    act(() => result.current.handleLibraryQueryChange('林夏'));
    act(() => result.current.updateLibraryJumpValue('3'));

    rerender({ open: false });
    rerender({ open: true });

    expect(result.current.libraryQuery).toBe('');
    expect(result.current.libraryPage.page).toBe(1);
    expect(result.current.libraryJumpValue).toBe('');
  });

  it('rejects invalid and oversized clone files before the gateway call', async () => {
    const { result } = renderHook(() =>
      useVoiceSelectionModalController({
        projectId: 'project-voice',
        open: false,
        onClose: vi.fn(),
        currentRef: { scope: 'project_narrator' },
        onPick: vi.fn(),
      }),
    );
    const invalidEvent = fileChangeEvent(
      new File(['text'], 'voice.txt', { type: 'text/plain' }),
    );
    const oversizedEvent = fileChangeEvent(
      new File([new Uint8Array(5_242_881)], 'voice.wav', {
        type: 'audio/wav',
      }),
    );

    await act(async () => result.current.handleFileChange(invalidEvent));
    await act(async () => result.current.handleFileChange(oversizedEvent));

    expect(invalidEvent.target.value).toBe('');
    expect(oversizedEvent.target.value).toBe('');
    expect(mocks.toastError.mock.calls[0]?.[0]).toContain('请选择音频文件');
    expect(mocks.toastError.mock.calls[1]?.[0]).toContain('不能超过 5MB');
    expect(mocks.createVoice).not.toHaveBeenCalled();
  });

  it('creates a valid custom voice with the filename stem and reloads', async () => {
    const { result } = renderHook(() =>
      useVoiceSelectionModalController({
        projectId: 'project-voice',
        open: false,
        onClose: vi.fn(),
        currentRef: { scope: 'project_narrator' },
        onPick: vi.fn(),
      }),
    );
    const file = new File(['audio'], 'voice.final.wav', { type: 'audio/wav' });
    const event = fileChangeEvent(file);

    await act(async () => result.current.handleFileChange(event));

    expect(mocks.createVoice).toHaveBeenCalledWith(
      'project-voice',
      file,
      'voice.final',
    );
    expect(mocks.loadReferences).toHaveBeenCalledWith('project-voice');
    expect(result.current.uploading).toBe(false);
  });

  it('maps clone network failures to the readable upload error', async () => {
    mocks.createVoice.mockRejectedValue(
      new Error('Request failed due to a network error'),
    );
    const { result } = renderHook(() =>
      useVoiceSelectionModalController({
        projectId: 'project-voice',
        open: false,
        onClose: vi.fn(),
        currentRef: { scope: 'project_narrator' },
        onPick: vi.fn(),
      }),
    );
    const event = fileChangeEvent(
      new File(['audio'], 'voice.ogg', { type: 'audio/ogg' }),
    );

    await act(async () => result.current.handleFileChange(event));

    expect(mocks.toastError).toHaveBeenCalledWith(
      expect.stringContaining('上传失败：网络中断'),
    );
    expect(result.current.uploading).toBe(false);
  });
});
