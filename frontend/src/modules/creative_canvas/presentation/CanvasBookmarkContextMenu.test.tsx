// Copyright (c) 2026 AI anime
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CanvasBookmarkContextMenu } from './CanvasBookmarkContextMenu';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'canvas.bookmarks.setCurrent': '设置当前定位（覆盖）',
        'canvas.bookmarks.setNew': '设置当前定位',
        'canvas.bookmarks.deleteCurrent': '删除当前定位',
        'canvas.bookmarks.clearAll': '清除所有定位',
      })[key] ?? key,
  }),
}));

describe('CanvasBookmarkContextMenu', () => {
  const baseProps = {
    index: 0,
    filled: true,
    position: { x: 10, y: 10 },
    onSetCurrent: vi.fn(),
    onDelete: vi.fn(),
    onClearAll: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders the available actions', () => {
    render(<CanvasBookmarkContextMenu {...baseProps} />);
    expect(screen.getByText('设置当前定位（覆盖）')).toBeInTheDocument();
    expect(screen.getByText('删除当前定位')).toBeInTheDocument();
    expect(screen.getByText('清除所有定位')).toBeInTheDocument();
  });

  it('runs the selected action and closes', async () => {
    const onSetCurrent = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <CanvasBookmarkContextMenu
        {...baseProps}
        onSetCurrent={onSetCurrent}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByText('设置当前定位（覆盖）'));
    expect(onSetCurrent).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('hides delete and the overwrite label for an empty slot', () => {
    render(<CanvasBookmarkContextMenu {...baseProps} filled={false} />);
    expect(screen.queryByText('删除当前定位')).not.toBeInTheDocument();
    expect(screen.getByText('设置当前定位')).toBeInTheDocument();
    expect(screen.queryByText('设置当前定位（覆盖）')).not.toBeInTheDocument();
    expect(screen.getByText('清除所有定位')).toBeInTheDocument();
  });
});
