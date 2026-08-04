// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CANVAS_CONNECTION_NODE_TYPES } from '../domain/canvasConnection';
import { MultiSelectionConnectButton } from './MultiSelectionConnectButton';

const toolbarProps = vi.fn();

vi.mock('@xyflow/react', () => ({
  Position: { Right: 'right' },
  NodeToolbar: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
    toolbarProps(props);
    return <div data-testid="node-toolbar">{children}</div>;
  },
}));

const selectedNodes = [
  {
    id: 'source-a',
    type: CANVAS_CONNECTION_NODE_TYPES.imageGen,
    selected: true,
    position: { x: 0, y: 0 },
    width: 200,
    height: 160,
  },
  {
    id: 'source-b',
    type: CANVAS_CONNECTION_NODE_TYPES.imageGen,
    selected: true,
    position: { x: 260, y: 0 },
    width: 200,
    height: 160,
  },
] as const;

function renderButton() {
  const callbacks = {
    onBatchOpenMenu: vi.fn(),
    onBatchDragStart: vi.fn(),
    onBatchDragMove: vi.fn(),
    onBatchDragEnd: vi.fn(),
  };
  render(<MultiSelectionConnectButton nodes={selectedNodes} {...callbacks} />);
  return callbacks;
}

describe('MultiSelectionConnectButton', () => {
  it('renders only for a compatible multi-selection and forwards clicks', () => {
    const callbacks = renderButton();
    expect(toolbarProps).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: ['source-a', 'source-b'],
      isVisible: true,
      position: 'right',
    }));

    fireEvent.click(screen.getByRole('button', { name: '批量连线' }), {
      clientX: 42,
      clientY: 24,
    });
    expect(callbacks.onBatchOpenMenu).toHaveBeenCalledWith({
      clientPosition: { x: 42, y: 24 },
    });
  });

  it('does not render for fewer than two eligible sources', () => {
    render(
      <MultiSelectionConnectButton
        nodes={[selectedNodes[0]]}
        onBatchOpenMenu={vi.fn()}
        onBatchDragStart={vi.fn()}
        onBatchDragMove={vi.fn()}
        onBatchDragEnd={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: '批量连线' })).not.toBeInTheDocument();
  });

  it('starts, moves, and completes a drag after crossing the threshold', () => {
    const callbacks = renderButton();
    const button = screen.getByRole('button', { name: '批量连线' });
    fireEvent.pointerDown(button, {
      button: 0,
      pointerId: 7,
      clientX: 10,
      clientY: 20,
    });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 30, clientY: 40 });

    expect(callbacks.onBatchDragStart).toHaveBeenCalledWith({
      clientPosition: { x: 10, y: 20 },
    });
    expect(callbacks.onBatchDragMove).toHaveBeenCalledWith({
      clientPosition: { x: 20, y: 30 },
    });
    expect(callbacks.onBatchDragEnd).toHaveBeenCalledWith({
      clientPosition: { x: 30, y: 40 },
    });
  });
});
