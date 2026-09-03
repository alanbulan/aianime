// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';
import { advanceProgress, estimatedProgress, type TaskProgressSource } from './optimisticProgress';

const start = Date.parse('2026-09-03T12:00:00Z');
const task: TaskProgressSource = { task_id: 'run-1', status: 'running', progress: 0.1, created_at: new Date(start).toISOString() };
const input = { id: 'run-1', task, connected: true };

describe('optimistic task progress', () => {
  it('uses the staged estimate and never finishes from elapsed time', () => {
    expect(estimatedProgress('queued', 0)).toBe(1);
    expect(estimatedProgress('running', 300_000)).toBe(75);
    expect(estimatedProgress('running', 1_200_000)).toBe(93);
    expect(estimatedProgress('running', 86_400_000)).toBeLessThan(100);
    expect(estimatedProgress('finalizing', 86_400_000)).toBeLessThan(100);
  });

  it('keeps moving after a server jump and never regresses with a later lower report', () => {
    const initial = advanceProgress(null, { ...input, task: { ...task, progress: 0.9 } }, start);
    const later = advanceProgress(initial, { ...input, task: { ...task, progress: 0.2 } }, start + 30_000);
    expect(later.value).toBeGreaterThan(initial.value);
    expect(later.value).toBeLessThan(100);
  });

  it('reserves 100 for completed, freezes failures, and resets a retry', () => {
    const running = advanceProgress(null, { ...input, task: { ...task, progress: 1 } }, start);
    expect(running.value).toBe(99.2);
    const failed = advanceProgress(running, { ...input, task: { ...task, status: 'failed' } }, start + 10_000);
    expect(advanceProgress(failed, { ...input, task: { ...task, status: 'failed' } }, start + 90_000).value).toBe(running.value);
    expect(advanceProgress(running, { ...input, task: { ...task, status: 'completed' } }, start + 10_000).value).toBe(100);
    expect(advanceProgress(failed, { id: 'run-2', connected: true, task: { status: 'queued', progress: 0 } }, start + 90_000).value).toBe(1);
  });

  it('freezes during reconnection and resumes without counting offline time as work', () => {
    const running = advanceProgress(null, input, start + 30_000);
    const offline = advanceProgress(running, { ...input, connected: false }, start + 30_000);
    const stillOffline = advanceProgress(offline, { ...input, connected: false }, start + 630_000);
    expect(stillOffline.value).toBe(running.value);
    const reconnected = advanceProgress(stillOffline, input, start + 630_000);
    expect(reconnected.value).toBe(running.value);
    expect(advanceProgress(reconnected, input, start + 631_000).value).toBeGreaterThan(running.value);
  });

  it('recovers elapsed progress from the server timestamp after remounting', () => {
    expect(advanceProgress(null, input, start + 300_000).value).toBe(75);
  });
});
