// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasMinimapVisibility } from './useCanvasMinimapVisibility';

describe('useCanvasMinimapVisibility', () => {
  const isImmersiveViewerActive = vi.fn(() => false);

  beforeEach(() => {
    vi.useFakeTimers();
    isImmersiveViewerActive.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows immediately on hover and delays hiding across overlay gaps', () => {
    const { result } = renderHook(() => useCanvasMinimapVisibility({
      isImmersiveViewerActive,
    }));

    expect(result.current.visible).toBe(false);
    act(() => result.current.setHovered(true));
    expect(result.current.visible).toBe(true);
    act(() => result.current.setHovered(false));
    act(() => vi.advanceTimersByTime(179));
    expect(result.current.visible).toBe(true);
    act(() => result.current.setHovered(true));
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visible).toBe(true);
    act(() => result.current.setHovered(false));
    act(() => vi.advanceTimersByTime(180));
    expect(result.current.visible).toBe(false);
  });

  it('keeps the minimap visible while pinned and cleans timers on unmount', () => {
    const { result, unmount } = renderHook(() => useCanvasMinimapVisibility({
      isImmersiveViewerActive,
    }));

    act(() => result.current.togglePinned());
    expect(result.current.visible).toBe(true);
    act(() => result.current.setHovered(false));
    act(() => vi.advanceTimersByTime(180));
    expect(result.current.visible).toBe(true);
    act(() => result.current.togglePinned());
    expect(result.current.visible).toBe(false);
    act(() => result.current.setHovered(false));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('toggles only with an unmodified M key outside blocked contexts', () => {
    const { result } = renderHook(() => useCanvasMinimapVisibility({
      isImmersiveViewerActive,
    }));
    const toggleEvent = new KeyboardEvent('keydown', {
      key: 'm',
      cancelable: true,
    });

    act(() => window.dispatchEvent(toggleEvent));
    expect(toggleEvent.defaultPrevented).toBe(true);
    expect(result.current.pinned).toBe(true);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'm',
      ctrlKey: true,
    })));
    expect(result.current.pinned).toBe(true);

    const input = document.createElement('input');
    document.body.append(input);
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'm',
    })));
    expect(result.current.pinned).toBe(true);

    isImmersiveViewerActive.mockReturnValue(true);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' })));
    expect(result.current.pinned).toBe(true);
    input.remove();
  });
});
