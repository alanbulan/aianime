// Copyright (c) 2026 AI anime
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskProgressSource } from '../domain/optimisticProgress';
import { useTaskProgress } from './useTaskProgress';
import { useTaskCenterStore } from './taskCenterStore';

describe('useTaskProgress lifecycle', () => {
  const task: TaskProgressSource = { task_id: 'run-1', status: 'running', progress: 0.1, created_at: '2026-09-03T12:00:00Z' };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T12:05:00Z'));
    useTaskCenterStore.getState().reset();
    useTaskCenterStore.getState().setHealth('connected');
    useTaskCenterStore.getState().setLastEventAt(Date.now());
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); useTaskCenterStore.getState().reset(); });

  it('restores from the server clock, stops on failure, and clears its interval', () => {
    const { result, rerender, unmount } = renderHook((source: TaskProgressSource) => useTaskProgress(source), { initialProps: task });
    expect(result.current.value).toBe(75);
    expect(result.current.elapsed).toBe('5:00');
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.value).toBeGreaterThan(75);
    rerender({ ...task, status: 'failed' });
    const frozen = result.current.value;
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.value).toBe(frozen);
    expect(vi.getTimerCount()).toBe(0);
    rerender({ task_id: 'run-2', status: 'queued', progress: 0, created_at: new Date().toISOString() });
    expect(result.current.value).toBe(1);
    rerender({ task_id: 'run-2', status: 'completed', progress: 1 });
    expect(result.current.percent).toBe('100');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('freezes on disconnect while the elapsed clock continues, then resumes', () => {
    const { result } = renderHook(() => useTaskProgress({ ...task, streamHealth: 'connected' }));
    act(() => useTaskCenterStore.getState().setHealth('reconnecting'));
    const frozen = result.current.value;
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.reconnecting).toBe(true);
    expect(result.current.value).toBe(frozen);
    expect(result.current.elapsed).toBe('6:00');
    act(() => useTaskCenterStore.getState().setHealth('connected'));
    expect(result.current.value).toBe(frozen);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.value).toBeGreaterThan(frozen);
  });

  it('requires successful polling snapshots and keeps local downloads independent of project SSE', () => {
    act(() => {
      useTaskCenterStore.getState().setHealth('polling');
      useTaskCenterStore.getState().setLastEventAt(Date.now() - 60_000);
    });
    const remote = renderHook(() => useTaskProgress(task));
    const local = renderHook(() => useTaskProgress(task, { local: true }));
    expect(remote.result.current.reconnecting).toBe(true);
    expect(local.result.current.reconnecting).toBe(false);
    act(() => useTaskCenterStore.getState().setLastEventAt(Date.now()));
    expect(remote.result.current.reconnecting).toBe(false);
  });
});
