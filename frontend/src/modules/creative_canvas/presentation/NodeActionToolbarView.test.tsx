// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NodeActionToolbarView } from './NodeActionToolbarView';

vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top' },
  NodeToolbar: ({ children, nodeId }: { children: ReactNode; nodeId: string }) => (
    <div data-testid="node-action-toolbar" data-node-id={nodeId}>
      {children}
    </div>
  ),
}));

describe('NodeActionToolbarView', () => {
  it('renders the storyboard group slot instead of the regular toolbar', () => {
    render(
      <NodeActionToolbarView
        nodeId="group-1"
        storyboardGroupToolbar={<div>storyboard-toolbar</div>}
        actions={<div>regular-actions</div>}
      />,
    );

    expect(screen.getByText('storyboard-toolbar')).toBeInTheDocument();
    expect(screen.queryByText('regular-actions')).not.toBeInTheDocument();
  });

  it('renders regular actions inside the node toolbar shell', () => {
    render(
      <NodeActionToolbarView
        nodeId="node-1"
        storyboardGroupToolbar={null}
        actions={<div>regular-actions</div>}
      />,
    );

    expect(screen.getByTestId('node-action-toolbar')).toHaveAttribute(
      'data-node-id',
      'node-1',
    );
    expect(screen.getByText('regular-actions')).toBeInTheDocument();
    const scaledToolbar = screen.getByText('regular-actions').parentElement?.parentElement;
    expect(scaledToolbar?.getAttribute('style')).toContain(
      'transform: scale(var(--ai-anime-canvas-zoom, 1))',
    );
    expect(scaledToolbar).toHaveStyle({ transformOrigin: 'bottom center' });
  });
});
