// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CanvasAsset } from '../domain/canvasAsset';

import { CanvasHistoryAssetCard } from './CanvasHistoryAssetCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function asset(
  kind: CanvasAsset['kind'],
  overrides: Partial<CanvasAsset> = {},
): CanvasAsset {
  return {
    id: `${kind}-a`,
    kind,
    url: `/${kind}-a`,
    previewUrl: null,
    nodeId: `node-${kind}-a`,
    label: `${kind} label`,
    prompt: `${kind} prompt`,
    timestamp: null,
    ...overrides,
  };
}

describe('CanvasHistoryAssetCard', () => {
  it('forwards image view, use, delete, and prompt commands', () => {
    const onView = vi.fn();
    const onUse = vi.fn();
    const onDelete = vi.fn();
    const onOpenPrompt = vi.fn();
    render(
      <CanvasHistoryAssetCard
        asset={asset('image')}
        sizePx={256}
        selectionMode={false}
        selected={false}
        onToggleSelect={vi.fn()}
        onView={onView}
        onUse={onUse}
        onDelete={onDelete}
        onOpenPrompt={onOpenPrompt}
      />,
    );

    fireEvent.click(screen.getByText('canvas.history.view'));
    fireEvent.click(screen.getByText('canvas.history.use'));
    fireEvent.click(screen.getByTitle('canvas.history.delete'));
    fireEvent.doubleClick(screen.getByText('image prompt'));
    expect(onView).toHaveBeenCalledOnce();
    expect(onUse).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onOpenPrompt).toHaveBeenCalledOnce();
  });

  it('replaces media actions with one selection surface in selection mode', () => {
    const onToggleSelect = vi.fn();
    render(
      <CanvasHistoryAssetCard
        asset={asset('video')}
        sizePx={192}
        selectionMode
        selected
        onToggleSelect={onToggleSelect}
        onView={vi.fn()}
        onUse={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const selector = screen.getByRole('button');
    expect(selector).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(selector);
    expect(onToggleSelect).toHaveBeenCalledOnce();
    expect(screen.queryByText('canvas.history.view')).not.toBeInTheDocument();
  });

  it('keeps audio playback local while forwarding use and delete commands', () => {
    const onUse = vi.fn();
    const onDelete = vi.fn();
    render(
      <CanvasHistoryAssetCard
        asset={asset('audio')}
        sizePx={220}
        selectionMode={false}
        selected={false}
        onToggleSelect={vi.fn()}
        onView={vi.fn()}
        onUse={onUse}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByRole('button', { name: 'canvas.history.play' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('canvas.history.use'));
    fireEvent.click(screen.getByTitle('canvas.history.delete'));
    expect(onUse).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByText('canvas.history.view')).not.toBeInTheDocument();
  });
});
