// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createEmptyBookmarks } from '@/modules/creative_canvas/domain/viewportBookmarks';
import { CanvasViewportBookmarks } from './CanvasViewportBookmarks';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function createProps(overrides = {}) {
  return {
    bookmarks: createEmptyBookmarks(),
    onJump: vi.fn(),
    onSetCurrent: vi.fn(),
    onDelete: vi.fn(),
    onClearAll: vi.fn(),
    ...overrides,
  };
}

describe('CanvasViewportBookmarks', () => {
  it('renders all ten digit slots', () => {
    render(<CanvasViewportBookmarks {...createProps()} />);
    for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      expect(screen.getByRole('button', { name: digit })).toBeInTheDocument();
    }
  });

  it('jumps from a filled slot and captures an empty slot', async () => {
    const bookmarks = createEmptyBookmarks();
    bookmarks[0] = { x: 0, y: 0, zoom: 1 };
    const onJump = vi.fn();
    const onSetCurrent = vi.fn();
    const user = userEvent.setup();
    render(<CanvasViewportBookmarks {...createProps({
      bookmarks,
      onJump,
      onSetCurrent,
    })} />);

    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '5' }));
    expect(onJump).toHaveBeenCalledWith(0);
    expect(onSetCurrent).toHaveBeenCalledWith(4);
  });

  it('opens the slot context menu', () => {
    render(<CanvasViewportBookmarks {...createProps()} />);
    fireEvent.contextMenu(screen.getByRole('button', { name: '3' }));
    expect(screen.getByText('canvas.bookmarks.setNew')).toBeInTheDocument();
    expect(screen.getByText('canvas.bookmarks.clearAll')).toBeInTheDocument();
  });
});
