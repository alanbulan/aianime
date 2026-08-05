// Copyright (c) 2026 AI anime
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { VoiceSelectionModalController } from './useVoiceSelectionModalController';

import { VoiceSelectionModalView } from './VoiceSelectionModalView';

function controller(
  overrides: Partial<VoiceSelectionModalController> = {},
): VoiceSelectionModalController {
  return {
    open: true,
    onClose: vi.fn(),
    onPick: vi.fn(),
    tab: 'library',
    setTab: vi.fn(),
    loading: false,
    error: null,
    libraryQuery: '',
    handleLibraryQueryChange: vi.fn(),
    libraryPage: {
      items: [],
      total: 0,
      totalPages: 1,
      page: 1,
      pages: [1],
    },
    libraryRows: [],
    setLibraryPageNumber: vi.fn(),
    libraryJumpValue: '',
    updateLibraryJumpValue: vi.fn(),
    commitLibraryJump: vi.fn(),
    mineQuery: '',
    handleMineQueryChange: vi.fn(),
    minePage: {
      items: [],
      total: 0,
      totalPages: 1,
      page: 1,
      pages: [1],
    },
    mineRows: [],
    setMinePageNumber: vi.fn(),
    mineJumpValue: '',
    updateMineJumpValue: vi.fn(),
    commitMineJump: vi.fn(),
    uploading: false,
    fileInputRef: createRef<HTMLInputElement>(),
    handleClone: vi.fn(),
    handleFileChange: vi.fn(async () => undefined),
    fileAccept: 'audio/wav,.wav',
    ...overrides,
  } as VoiceSelectionModalController;
}

describe('VoiceSelectionModalView', () => {
  it('renders nothing while closed', () => {
    render(
      <VoiceSelectionModalView controller={controller({ open: false })} />,
    );

    expect(screen.queryByText('音色选择')).not.toBeInTheDocument();
  });

  it('renders library rows and forwards tab, search, pick, and pagination commands', () => {
    const setTab = vi.fn();
    const handleLibraryQueryChange = vi.fn();
    const onPick = vi.fn();
    const setLibraryPageNumber = vi.fn();
    const updateLibraryJumpValue = vi.fn();
    const commitLibraryJump = vi.fn();
    const pick = {
      ref: { scope: 'user_custom' as const, voiceId: 'voice-a' },
      label: 'Voice A',
      language: '中文',
    };
    render(
      <VoiceSelectionModalView
        controller={controller({
          setTab,
          handleLibraryQueryChange,
          onPick,
          setLibraryPageNumber,
          updateLibraryJumpValue,
          commitLibraryJump,
          libraryPage: {
            items: [],
            total: 21,
            totalPages: 2,
            page: 1,
            pages: [1, 2],
          },
          libraryRows: [
            {
              key: 'voice-a',
              title: 'Voice A',
              language: '中文',
              gender: '女',
              isActive: false,
              pick,
            },
            {
              key: 'voice-b',
              title: 'Voice B',
              language: null,
              gender: null,
              isActive: true,
              pick: {
                ref: { scope: 'user_custom', voiceId: 'voice-b' },
                label: 'Voice B',
              },
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('Voice A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已选' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '选择' }));
    expect(onPick).toHaveBeenCalledWith(pick);
    fireEvent.click(screen.getByText('我的音色'));
    expect(setTab).toHaveBeenCalledWith('mine');
    fireEvent.change(screen.getByPlaceholderText('搜索音色库'), {
      target: { value: '林夏' },
    });
    expect(handleLibraryQueryChange).toHaveBeenCalledWith('林夏');
    fireEvent.click(screen.getByRole('button', { name: '>' }));
    expect(setLibraryPageNumber).toHaveBeenCalledWith(2);
    const jump = screen.getByPlaceholderText('1');
    fireEvent.change(jump, { target: { value: '2' } });
    expect(updateLibraryJumpValue).toHaveBeenCalledWith('2');
    fireEvent.keyDown(jump, { key: 'Enter' });
    expect(commitLibraryJump).toHaveBeenCalledOnce();
  });

  it('renders the custom-voice empty state and forwards both clone commands', () => {
    const handleClone = vi.fn();
    render(
      <VoiceSelectionModalView
        controller={controller({ tab: 'mine', handleClone })}
      />,
    );

    expect(
      screen.getByText('暂无可用音色，快去克隆你的新音色吧～'),
    ).toBeInTheDocument();
    const cloneButtons = screen.getAllByRole('button', {
      name: '克隆新音色',
    });
    expect(cloneButtons).toHaveLength(2);
    fireEvent.click(cloneButtons[0]);
    fireEvent.click(cloneButtons[1]);
    expect(handleClone).toHaveBeenCalledTimes(2);
    expect(document.querySelector('input[type="file"]')).toHaveAttribute(
      'accept',
      'audio/wav,.wav',
    );
  });
});
