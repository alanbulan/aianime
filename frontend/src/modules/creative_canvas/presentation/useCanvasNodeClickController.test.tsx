// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasNodeClickController,
  type CanvasNodeClickControllerOptions,
  type CanvasNodeClickTarget,
} from './useCanvasNodeClickController';

interface TestNode extends CanvasNodeClickTarget {
  storyboardGroup: boolean;
}

function node(overrides: Partial<TestNode> = {}): TestNode {
  return {
    id: 'node',
    position: { x: 10, y: 20 },
    storyboardGroup: false,
    ...overrides,
  };
}

function storyboardGroup(overrides: Partial<TestNode> = {}): TestNode {
  return node({ storyboardGroup: true, ...overrides });
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
  overrides: Partial<CanvasNodeClickControllerOptions<TestNode>> = {},
): CanvasNodeClickControllerOptions<TestNode> {
  return {
    placementActive: false,
    commitPlacement: vi.fn(() => true),
    suppressNextPaneClick: vi.fn(),
    centerViewport: vi.fn(),
    isStoryboardGroupNode: (candidate) => candidate.storyboardGroup,
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
    expect(options.suppressNextPaneClick).toHaveBeenCalledOnce();
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
    expect(options.suppressNextPaneClick).not.toHaveBeenCalled();
    expect(options.centerViewport).not.toHaveBeenCalled();
  });

  it('does not suppress the pane when placement is no longer available', () => {
    const options = createOptions({
      placementActive: true,
      commitPlacement: vi.fn(() => false),
    });
    const { result } = renderHook(() =>
      useCanvasNodeClickController(options),
    );

    act(() => result.current.handleNodeClick(event(), node()));

    expect(options.commitPlacement).toHaveBeenCalledOnce();
    expect(options.suppressNextPaneClick).not.toHaveBeenCalled();
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
