// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCanvasLifecycle } from './useCanvasLifecycle';

function rect(width: number, height: number): DOMRect {
  return {
    x: 10,
    y: 20,
    top: 20,
    left: 10,
    right: 10 + width,
    bottom: 20 + height,
    width,
    height,
    toJSON: () => ({}),
  };
}

describe('useCanvasLifecycle', () => {
  it('centers an empty canvas and closes the viewer on unmount', () => {
    const wrapperElement = document.createElement('div');
    vi.spyOn(wrapperElement, 'getBoundingClientRect').mockReturnValue(
      rect(800, 600),
    );
    const setViewport = vi.fn();
    const closeImageViewer = vi.fn();
    const { unmount } = renderHook(() => useCanvasLifecycle({
      wrapperRef: { current: wrapperElement },
      isCanvasEmpty: () => true,
      setViewport,
      closeImageViewer,
    }));

    expect(setViewport).toHaveBeenCalledWith({ x: 400, y: 300, zoom: 1 });
    unmount();
    expect(closeImageViewer).toHaveBeenCalledOnce();
  });

  it('preserves a restored viewport when the canvas is not empty', () => {
    const setViewport = vi.fn();
    const closeImageViewer = vi.fn();
    const options = {
      wrapperRef: { current: document.createElement('div') },
      isCanvasEmpty: () => false,
      setViewport,
      closeImageViewer,
    };
    const { rerender, unmount } = renderHook(() => useCanvasLifecycle(options));

    rerender();
    expect(setViewport).not.toHaveBeenCalled();
    unmount();
    expect(closeImageViewer).toHaveBeenCalledOnce();
  });
});
