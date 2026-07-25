// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasNodeHover } from './useCanvasNodeHover';

describe('useCanvasNodeHover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the entered node immediately and delays clearing it', () => {
    const setHoveredNodeId = vi.fn();
    const { result } = renderHook(() => useCanvasNodeHover(setHoveredNodeId));

    act(() => result.current.handleNodeMouseEnter(undefined, { id: 'node-a' }));
    expect(setHoveredNodeId).toHaveBeenLastCalledWith('node-a');

    act(() => result.current.handleNodeMouseLeave());
    act(() => vi.advanceTimersByTime(399));
    expect(setHoveredNodeId).not.toHaveBeenCalledWith(null);

    act(() => result.current.handleNodeMouseEnter(undefined, { id: 'node-b' }));
    act(() => vi.advanceTimersByTime(1));
    expect(setHoveredNodeId).toHaveBeenLastCalledWith('node-b');

    act(() => result.current.handleNodeMouseLeave());
    act(() => vi.advanceTimersByTime(400));
    expect(setHoveredNodeId).toHaveBeenLastCalledWith(null);
  });

  it('allows consumers to cancel clearing and cleans pending timers on unmount', () => {
    const setHoveredNodeId = vi.fn();
    const { result, unmount } = renderHook(() => useCanvasNodeHover(setHoveredNodeId));

    act(() => result.current.scheduleHoveredNodeClear());
    expect(vi.getTimerCount()).toBe(1);
    act(() => result.current.clearHoveredNodeTimer());
    expect(vi.getTimerCount()).toBe(0);
    expect(setHoveredNodeId).not.toHaveBeenCalled();

    act(() => result.current.scheduleHoveredNodeClear());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
