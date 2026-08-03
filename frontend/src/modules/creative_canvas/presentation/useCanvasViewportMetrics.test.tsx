// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCanvasViewportMetrics,
  type CanvasTransformStorePort,
} from './useCanvasViewportMetrics';

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }

  notify(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe('useCanvasViewportMetrics', () => {
  let wrapperElement: HTMLDivElement;
  let rect: DOMRect;

  beforeEach(() => {
    ResizeObserverMock.instances = [];
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    wrapperElement = document.createElement('div');
    document.body.append(wrapperElement);
    rect = {
      left: 0,
      top: 0,
      right: 321,
      bottom: 241,
      width: 320.6,
      height: 240.6,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    vi.spyOn(wrapperElement, 'getBoundingClientRect').mockImplementation(() => rect);
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--ai-anime-canvas-zoom');
    wrapperElement.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('publishes zoom changes and observes wrapper dimensions', () => {
    let zoom = 1.25;
    let transformListener: (() => void) | null = null;
    const unsubscribe = vi.fn();
    const transformStore: CanvasTransformStorePort = {
      getState: () => ({ transform: [0, 0, zoom] }),
      subscribe: vi.fn((listener) => {
        transformListener = listener;
        return unsubscribe;
      }),
    };
    const setViewportSize = vi.fn();
    const { unmount } = renderHook(() => useCanvasViewportMetrics({
      wrapperRef: { current: wrapperElement },
      transformStore,
      setViewportSize,
    }));

    expect(document.documentElement.style.getPropertyValue('--ai-anime-canvas-zoom'))
      .toBe('1.25');
    expect(setViewportSize).toHaveBeenCalledWith({ width: 321, height: 241 });
    zoom = 0.8;
    act(() => transformListener?.());
    expect(document.documentElement.style.getPropertyValue('--ai-anime-canvas-zoom'))
      .toBe('0.8');
    rect = { ...rect, width: -1, height: 100.4 };
    act(() => ResizeObserverMock.instances[0]?.notify());
    expect(setViewportSize).toHaveBeenLastCalledWith({ width: 0, height: 100 });
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(ResizeObserverMock.instances[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it('skips size observation while the wrapper is unmounted', () => {
    const unsubscribe = vi.fn();
    const transformStore: CanvasTransformStorePort = {
      getState: () => ({ transform: [0, 0, 1] }),
      subscribe: () => unsubscribe,
    };
    const setViewportSize = vi.fn();
    const { unmount } = renderHook(() => useCanvasViewportMetrics({
      wrapperRef: { current: null },
      transformStore,
      setViewportSize,
    }));

    expect(setViewportSize).not.toHaveBeenCalled();
    expect(ResizeObserverMock.instances).toEqual([]);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
