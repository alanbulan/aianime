// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';
import {
  useCanvasAutoLayoutController,
  type CanvasAutoLayoutControllerOptions,
} from './useCanvasAutoLayoutController';

function node(id: string, x: number, y: number): CanvasNode {
  return {
    id,
    type: 'image_gen',
    position: { x, y },
    data: {},
    measured: { width: 320, height: 200 },
  } as unknown as CanvasNode;
}

function edge(source: string, target: string): CanvasEdge {
  return { id: `${source}->${target}`, source, target } as CanvasEdge;
}

function createOptions(
  overrides: Partial<CanvasAutoLayoutControllerOptions> = {},
): CanvasAutoLayoutControllerOptions {
  return {
    nodes: [],
    edges: [],
    setNodePositions: vi.fn(),
    fitViewport: vi.fn(),
    scheduleAfterLayout: vi.fn((callback) => callback()),
    ...overrides,
  };
}

describe('useCanvasAutoLayoutController', () => {
  it('does nothing when auto layout has no top-level nodes', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasAutoLayoutController(options),
    );

    act(() => result.current.organizeCanvas());

    expect(options.setNodePositions).not.toHaveBeenCalled();
    expect(options.scheduleAfterLayout).not.toHaveBeenCalled();
    expect(options.fitViewport).not.toHaveBeenCalled();
  });

  it('commits changed positions before fitting the organized graph', () => {
    const options = createOptions({
      nodes: [node('source', 0, 0), node('target', 0, 0)],
      edges: [edge('source', 'target')],
    });
    const { result } = renderHook(() =>
      useCanvasAutoLayoutController(options),
    );

    act(() => result.current.organizeCanvas());

    expect(options.setNodePositions).toHaveBeenCalledOnce();
    const positions = vi.mocked(options.setNodePositions).mock.calls[0][0];
    expect(positions.source.x).toBeLessThan(positions.target.x);
    expect(options.scheduleAfterLayout).toHaveBeenCalledOnce();
    expect(options.fitViewport).toHaveBeenCalledWith({
      duration: 240,
      padding: 0.2,
    });
  });

  it('fits an unchanged non-empty graph without writing positions', () => {
    const options = createOptions({ nodes: [node('only', 25, 40)] });
    const { result } = renderHook(() =>
      useCanvasAutoLayoutController(options),
    );

    act(() => result.current.organizeCanvas());

    expect(options.setNodePositions).not.toHaveBeenCalled();
    expect(options.scheduleAfterLayout).toHaveBeenCalledOnce();
    expect(options.fitViewport).toHaveBeenCalledWith({
      duration: 240,
      padding: 0.2,
    });
  });
});
