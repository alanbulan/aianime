// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import type { ReactFlowInstance } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/stores/canvasStore';

import {
  useCanvasViewportRuntimeController,
  type CanvasViewportRuntimeControllerOptions,
} from './useCanvasViewportRuntimeController';

function keyboardEvent(
  key: string,
  modifiers: Pick<KeyboardEventInit, 'ctrlKey' | 'shiftKey'> = {},
): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    cancelable: true,
    ...modifiers,
  });
}

function createOptions() {
  let viewport = { x: 40, y: 50, zoom: 1.25 };
  const viewportPort = {
    getViewport: vi.fn(() => viewport),
    setViewport: vi.fn((nextViewport: typeof viewport) => {
      viewport = nextViewport;
      return Promise.resolve(true);
    }),
  } as unknown as ReactFlowInstance;
  const unsubscribeTransform = vi.fn();
  const commitViewport = vi.fn<CanvasViewportRuntimeControllerOptions['commitViewport']>();
  const setViewportSize = vi.fn<CanvasViewportRuntimeControllerOptions['setViewportSize']>();

  return {
    wrapperRef: { current: null },
    viewportPort,
    transformStore: {
      getState: () => ({ transform: [0, 0, 1.25] as const }),
      subscribe: vi.fn(() => unsubscribeTransform),
    },
    commitViewport,
    setViewportSize,
    unsubscribeTransform,
  };
}

describe('useCanvasViewportRuntimeController', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      currentViewport: { x: 10, y: 20, zoom: 0.8 },
      viewportBookmarks: Array.from({ length: 10 }, () => null),
    });
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--ai-anime-canvas-zoom');
  });

  it('captures the hydrated viewport once and exposes the existing runtime handlers', () => {
    const options = createOptions();
    const { result, rerender, unmount } = renderHook(() =>
      useCanvasViewportRuntimeController(options),
    );

    expect(result.current.initialViewport).toEqual({ x: 10, y: 20, zoom: 0.8 });
    expect(document.documentElement.style.getPropertyValue('--ai-anime-canvas-zoom'))
      .toBe('1.25');
    act(() => {
      result.current.handleMoveEnd(undefined, { x: 30, y: 40, zoom: 1.1 });
    });
    expect(options.commitViewport).toHaveBeenCalledWith({ x: 30, y: 40, zoom: 1.1 });

    useCanvasStore.setState({ currentViewport: { x: 100, y: 200, zoom: 2 } });
    rerender();
    expect(result.current.initialViewport).toEqual({ x: 10, y: 20, zoom: 0.8 });
    expect(options.setViewportSize).not.toHaveBeenCalled();

    unmount();
    expect(options.unsubscribeTransform).toHaveBeenCalledOnce();
  });

  it('routes bookmark capture, jump, and clear commands through the viewport port', () => {
    const options = createOptions();
    renderHook(() => useCanvasViewportRuntimeController(options));

    act(() => window.dispatchEvent(keyboardEvent('1', { ctrlKey: true })));
    expect(useCanvasStore.getState().viewportBookmarks[0]).toEqual({
      x: 40,
      y: 50,
      zoom: 1.25,
    });

    act(() => window.dispatchEvent(keyboardEvent('1')));
    expect(options.viewportPort.setViewport).toHaveBeenCalledWith(
      { x: 40, y: 50, zoom: 1.25 },
      expect.objectContaining({
        duration: 550,
        interpolate: 'smooth',
      }),
    );

    act(() => window.dispatchEvent(keyboardEvent('E', {
      ctrlKey: true,
      shiftKey: true,
    })));
    expect(useCanvasStore.getState().viewportBookmarks).toEqual(
      Array.from({ length: 10 }, () => null),
    );
  });
});
