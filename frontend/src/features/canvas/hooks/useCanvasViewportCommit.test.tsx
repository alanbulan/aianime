// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCanvasViewportCommit } from './useCanvasViewportCommit';

describe('useCanvasViewportCommit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throttles move commits and always commits the final viewport', () => {
    const commitViewport = vi.fn();
    const now = vi.spyOn(Date, 'now');
    const { result } = renderHook(() => useCanvasViewportCommit(commitViewport));
    const first = { x: 10, y: 20, zoom: 1 };
    const throttled = { x: 20, y: 30, zoom: 1.1 };
    const next = { x: 30, y: 40, zoom: 1.2 };
    const final = { x: 40, y: 50, zoom: 1.3 };

    now.mockReturnValue(1_000);
    act(() => result.current.handleMove(undefined, first));
    expect(commitViewport).toHaveBeenLastCalledWith(first);

    now.mockReturnValue(1_119);
    act(() => result.current.handleMove(undefined, throttled));
    expect(commitViewport).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_120);
    act(() => result.current.handleMove(undefined, next));
    expect(commitViewport).toHaveBeenLastCalledWith(next);

    now.mockReturnValue(1_121);
    act(() => result.current.handleMoveEnd(undefined, final));
    expect(commitViewport).toHaveBeenLastCalledWith(final);
    expect(commitViewport).toHaveBeenCalledTimes(3);
  });

  it('starts a new throttle window after the final viewport commit', () => {
    const commitViewport = vi.fn();
    const now = vi.spyOn(Date, 'now');
    const { result } = renderHook(() => useCanvasViewportCommit(commitViewport));
    const final = { x: 10, y: 20, zoom: 1 };
    const duringWindow = { x: 20, y: 30, zoom: 1.1 };
    const afterWindow = { x: 30, y: 40, zoom: 1.2 };

    now.mockReturnValue(2_000);
    act(() => result.current.handleMoveEnd(undefined, final));
    now.mockReturnValue(2_119);
    act(() => result.current.handleMove(undefined, duringWindow));
    expect(commitViewport).toHaveBeenCalledTimes(1);

    now.mockReturnValue(2_120);
    act(() => result.current.handleMove(undefined, afterWindow));
    expect(commitViewport).toHaveBeenLastCalledWith(afterWindow);
    expect(commitViewport).toHaveBeenCalledTimes(2);
  });
});
