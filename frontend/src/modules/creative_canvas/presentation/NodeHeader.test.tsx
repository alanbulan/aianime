// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NodeHeader } from './NodeHeader';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe('NodeHeader', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('renders a single-line title and the surrounding slots', () => {
    render(
      <NodeHeader
        icon={<span>icon</span>}
        titleText="节点标题"
        metaText="meta"
        subtitle={<span>subtitle</span>}
        rightSlot={<span>right</span>}
      />,
    );

    expect(screen.getByTitle('节点标题')).toHaveClass('whitespace-nowrap');
    expect(screen.getByText('meta')).toBeInTheDocument();
    expect(screen.getByText('subtitle')).toBeInTheDocument();
    expect(screen.getByText('right')).toBeInTheDocument();
  });

  it('commits trimmed editable titles and restores the previous title on escape', () => {
    const onTitleChange = vi.fn();
    render(
      <NodeHeader
        titleText="原标题"
        editable
        onTitleChange={onTitleChange}
      />,
    );

    fireEvent.doubleClick(screen.getByRole('button', { name: '原标题' }));
    const input = screen.getByDisplayValue('原标题');
    fireEvent.change(input, { target: { value: '  新标题  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onTitleChange).toHaveBeenCalledWith('新标题');

    fireEvent.doubleClick(screen.getByRole('button', { name: '原标题' }));
    const secondInput = screen.getByDisplayValue('原标题');
    fireEvent.change(secondInput, { target: { value: '不提交' } });
    fireEvent.keyDown(secondInput, { key: 'Escape' });
    expect(onTitleChange).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '原标题' })).toBeInTheDocument();
  });
});
