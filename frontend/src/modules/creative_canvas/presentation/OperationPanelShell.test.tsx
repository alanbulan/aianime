// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OperationPanelShell } from './OperationPanelShell';

describe('OperationPanelShell', () => {
  it('renders the inline panel without collapsing parent interactions', () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <OperationPanelShell
          expanded={false}
          onCollapse={vi.fn()}
          inlineClassName="inline-panel"
          inlineStyle={{ width: 320 }}
        >
          panel-content
        </OperationPanelShell>
      </div>,
    );

    const panel = screen.getByText('panel-content');
    fireEvent.click(panel);
    expect(panel).toHaveClass('inline-panel');
    expect(panel).toHaveStyle({ width: '320px' });
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('collapses an expanded portal by backdrop click and Escape', () => {
    const onCollapse = vi.fn();
    render(
      <OperationPanelShell
        expanded
        onCollapse={onCollapse}
        inlineClassName="inline-panel"
        inlineStyle={{}}
        modalStyle={{ width: 640 }}
      >
        panel-content
      </OperationPanelShell>,
    );

    const dialog = screen.getByText('panel-content');
    const backdrop = dialog.parentElement!;
    expect(dialog).toHaveStyle({ width: '640px' });
    fireEvent.click(dialog);
    expect(onCollapse).not.toHaveBeenCalled();
    fireEvent.click(backdrop);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCollapse).toHaveBeenCalledTimes(2);
  });
});
