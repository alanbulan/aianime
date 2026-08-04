// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHoverMenuController } from './useHoverMenuController';

describe('useHoverMenuController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens immediately and closes after the hover delay', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useHoverMenuController());

    act(() => result.current.hoverProps.onMouseEnter());
    expect(result.current.rootProps.open).toBe(true);

    act(() => result.current.hoverProps.onMouseLeave());
    act(() => vi.advanceTimersByTime(159));
    expect(result.current.rootProps.open).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.rootProps.open).toBe(false);
  });

  it('cancels a pending close when the pointer re-enters', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useHoverMenuController());

    act(() => result.current.hoverProps.onMouseEnter());
    act(() => result.current.hoverProps.onMouseLeave());
    act(() => vi.advanceTimersByTime(80));
    act(() => result.current.hoverProps.onMouseEnter());
    act(() => vi.advanceTimersByTime(160));

    expect(result.current.rootProps.open).toBe(true);
  });

  it('keeps controlled open changes non-modal', () => {
    const { result } = renderHook(() => useHoverMenuController());

    act(() => result.current.rootProps.onOpenChange(true));

    expect(result.current.rootProps).toEqual(
      expect.objectContaining({ open: true, modal: false }),
    );
  });
});
