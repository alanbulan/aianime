// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasNodePlacementConfirm } from './useCanvasNodePlacementConfirm';

describe('useCanvasNodePlacementConfirm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps only the latest placement active for its full confirmation window', () => {
    const { result } = renderHook(() => useCanvasNodePlacementConfirm());

    act(() => result.current.triggerPlacementConfirm('node-a'));
    expect(result.current.placementConfirmNodeId).toBe('node-a');
    act(() => vi.advanceTimersByTime(500));

    act(() => result.current.triggerPlacementConfirm('node-b'));
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.placementConfirmNodeId).toBe('node-b');
    act(() => vi.advanceTimersByTime(499));
    expect(result.current.placementConfirmNodeId).toBe('node-b');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.placementConfirmNodeId).toBeNull();
  });

  it('cleans a pending confirmation timer on unmount', () => {
    const { result, unmount } = renderHook(() => useCanvasNodePlacementConfirm());

    act(() => result.current.triggerPlacementConfirm('node-a'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
