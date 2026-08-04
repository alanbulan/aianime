// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasFpsMeter } from './CanvasFpsMeter';

describe('CanvasFpsMeter', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 7));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('starts and stops the FPS loop from the control button', () => {
    const { unmount } = render(<CanvasFpsMeter />);
    const open = screen.getByRole('button', { name: '开启 FPS 显示' });

    fireEvent.click(open);
    expect(screen.getByRole('button', { name: '关闭 FPS 显示' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('FPS')).toBeInTheDocument();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();

    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });
});
