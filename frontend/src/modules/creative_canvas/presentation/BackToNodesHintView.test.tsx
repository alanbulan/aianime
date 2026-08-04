// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BackToNodesHintView } from './BackToNodesHintView';

describe('BackToNodesHintView', () => {
  it('stays hidden until the adapter marks it visible', () => {
    const { rerender } = render(
      <BackToNodesHintView
        visible={false}
        hint="节点不在视口内"
        buttonLabel="回到节点"
        onBackToNodes={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <BackToNodesHintView
        visible
        hint="节点不在视口内"
        buttonLabel="回到节点"
        onBackToNodes={vi.fn()}
      />,
    );
    expect(screen.getByText('节点不在视口内')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回到节点' })).toBeInTheDocument();
  });

  it('forwards the return command', () => {
    const onBackToNodes = vi.fn();
    render(
      <BackToNodesHintView
        visible
        hint="节点不在视口内"
        buttonLabel="回到节点"
        onBackToNodes={onBackToNodes}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '回到节点' }));
    expect(onBackToNodes).toHaveBeenCalledOnce();
  });
});
