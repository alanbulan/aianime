// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useViewerImmersiveBody } from '@/features/viewer-kit/useViewerImmersiveBody';

import { useCanvasMinimapVisibility } from './useCanvasMinimapVisibility';

describe('useCanvasMinimapVisibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows immediately on hover and delays hiding across overlay gaps', () => {
    const { result } = renderHook(() => useCanvasMinimapVisibility());

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

  it('keeps the minimap visible while pinned and cleans pending timers on unmount', () => {
    const { result, unmount } = renderHook(() => useCanvasMinimapVisibility());

    act(() => result.current.togglePinned());
    expect(result.current.pinned).toBe(true);
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

  it('toggles with an unmodified M key outside typing and immersive contexts', () => {
    const { result } = renderHook(() => useCanvasMinimapVisibility());
    const toggleEvent = new KeyboardEvent('keydown', {
      key: 'm',
      cancelable: true,
    });

    act(() => window.dispatchEvent(toggleEvent));
    expect(toggleEvent.defaultPrevented).toBe(true);
    expect(result.current.pinned).toBe(true);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'M' })));
    expect(result.current.pinned).toBe(false);

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'm',
      ctrlKey: true,
    })));
    expect(result.current.pinned).toBe(false);

    const input = document.createElement('input');
    document.body.append(input);
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'm',
    })));
    expect(result.current.pinned).toBe(false);

    const immersiveViewer = renderHook(() => useViewerImmersiveBody(true));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' })));
    expect(result.current.pinned).toBe(false);
    immersiveViewer.unmount();
    input.remove();
  });
});
