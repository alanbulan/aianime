// Copyright (c) 2026 AI anime
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { EdgeProps } from '@xyflow/react';
import { create } from 'zustand';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDisconnectableEdge,
  type CanvasEdgeRenderStore,
} from './DisconnectableEdge';

vi.mock('@xyflow/react', () => ({
  BaseEdge: ({ path }: { path: string }) => (
    <path data-testid="base-edge" data-path={path} />
  ),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => children,
  Position: {
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
    Top: 'top',
  },
  getBezierPath: () => ['M 0 0 C 1 1 2 2 3 3', 1.5, 1.5],
}));

const edgeProps = {
  id: 'edge-1',
  source: 'source',
  target: 'target',
  sourceX: 0,
  sourceY: 20,
  targetX: 200,
  targetY: 100,
  sourcePosition: 'right',
  targetPosition: 'left',
  selected: false,
  data: {},
};

describe('DisconnectableEdge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the injected routing mode and deletion port', () => {
    const deleteEdge = vi.fn();
    const useStore = create<CanvasEdgeRenderStore>(() => ({
      nodes: [],
      selectedNodeId: null,
      deleteEdge,
    }));
    const Edge = createDisconnectableEdge({
      useStore,
      useRoutingMode: () => 'orthogonal',
    });
    const { container } = render(
      <svg>
        <Edge {...(edgeProps as unknown as EdgeProps)} />
      </svg>,
    );

    expect(screen.getByTestId('base-edge')).toHaveAttribute(
      'data-path',
      'M 0 20 L 24 20 L 24 60 L 176 60 L 176 100 L 200 100',
    );

    const hitArea = container.querySelector('path.nodrag');
    expect(hitArea).not.toBeNull();
    fireEvent.pointerEnter(hitArea!);
    act(() => vi.advanceTimersByTime(500));
    fireEvent.click(screen.getByRole('button', { name: '断开连线' }));

    expect(deleteEdge).toHaveBeenCalledOnce();
    expect(deleteEdge).toHaveBeenCalledWith('edge-1');
  });

  it('does not expose disconnect action for a managed projection edge', () => {
    const useStore = create<CanvasEdgeRenderStore>(() => ({
      nodes: [],
      selectedNodeId: null,
      deleteEdge: vi.fn(),
    }));
    const Edge = createDisconnectableEdge({
      useStore,
      useRoutingMode: () => 'spline',
    });
    const { container } = render(
      <svg>
        <Edge
          {...({
            ...edgeProps,
            data: { preset_managed: true },
          } as unknown as EdgeProps)}
        />
      </svg>,
    );

    fireEvent.pointerEnter(container.querySelector('path.nodrag')!);
    act(() => vi.advanceTimersByTime(500));

    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
  });
});
