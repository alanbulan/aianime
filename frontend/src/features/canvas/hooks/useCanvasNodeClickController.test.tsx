// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  useCanvasNodeClickController,
  type CanvasNodeClickControllerOptions,
} from './useCanvasNodeClickController';

function node(
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id: 'node',
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 10, y: 20 },
    data: {},
    ...overrides,
  } as CanvasNode;
}

function storyboardGroup(
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return node({
    type: CANVAS_NODE_TYPES.group,
    data: { storyboardGroup: true },
    ...overrides,
  });
}

function event(clientX = 120, clientY = 80): ReactMouseEvent {
  return {
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as ReactMouseEvent;
}

function createOptions(
  overrides: Partial<CanvasNodeClickControllerOptions> = {},
): CanvasNodeClickControllerOptions {
  return {
    placementActive: false,
    commitPlacement: vi.fn(),
    centerViewport: vi.fn(),
    ...overrides,
  };
}

describe('useCanvasNodeClickController', () => {
  it('commits placement at the click position before node focus handling', () => {
    const options = createOptions({ placementActive: true });
    const clickEvent = event();
    const { result } = renderHook(() =>
      useCanvasNodeClickController(options),
    );

    act(() => result.current.handleNodeClick(
      clickEvent,
      storyboardGroup(),
    ));

    expect(clickEvent.preventDefault).toHaveBeenCalledOnce();
    expect(clickEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(options.commitPlacement).toHaveBeenCalledWith({ x: 120, y: 80 });
    expect(options.centerViewport).not.toHaveBeenCalled();
  });

  it('ignores ordinary nodes outside placement mode', () => {
    const options = createOptions();
    const clickEvent = event();
    const { result } = renderHook(() =>
      useCanvasNodeClickController(options),
    );

    act(() => result.current.handleNodeClick(clickEvent, node()));

    expect(clickEvent.preventDefault).not.toHaveBeenCalled();
    expect(options.commitPlacement).not.toHaveBeenCalled();
    expect(options.centerViewport).not.toHaveBeenCalled();
  });

  it('centers a storyboard group using its measured size', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasNodeClickController(options),
    );

    act(() => result.current.handleNodeClick(
      event(),
      storyboardGroup({ measured: { width: 500, height: 300 } }),
    ));

    expect(options.centerViewport).toHaveBeenCalledWith(
      { x: 260, y: 170 },
      { zoom: 1, duration: 320 },
    );
  });

  it('preserves the default storyboard focus size before measurement', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasNodeClickController(options),
    );

    act(() => result.current.handleNodeClick(event(), storyboardGroup()));

    expect(options.centerViewport).toHaveBeenCalledWith(
      { x: 170, y: 140 },
      { zoom: 1, duration: 320 },
    );
  });
});
