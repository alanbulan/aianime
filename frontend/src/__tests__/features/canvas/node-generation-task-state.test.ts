// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  resolveNodeGenerationTaskState,
  type CanvasNodeGenerationTask,
} from '@/features/canvas/application/nodeGenerationTaskState';

function task(status: string): CanvasNodeGenerationTask {
  return { status };
}

describe('resolveNodeGenerationTaskState', () => {
  it('keeps a submission without a task key in optimistic generating state', () => {
    expect(
      resolveNodeGenerationTaskState({
        data: { isGenerating: true },
        task: null,
        taskCenterHydrated: true,
      }),
    ).toEqual(expect.objectContaining({
      isGenerating: true,
      optimisticOnly: true,
      waitingForTaskRecord: false,
    }));
  });

  it('waits for a keyed task while task-center is hydrating', () => {
    expect(
      resolveNodeGenerationTaskState({
        data: { generationTaskKey: 'task-1', isGenerating: true },
        task: null,
        taskCenterHydrated: false,
      }),
    ).toEqual(expect.objectContaining({
      isGenerating: true,
      optimisticOnly: false,
      waitingForTaskRecord: true,
    }));
  });

  it('keeps a recently submitted keyed task active during the task-record gap', () => {
    expect(
      resolveNodeGenerationTaskState({
        data: {
          generationStartedAt: 5_000,
          generationTaskKey: 'task-1',
          isGenerating: true,
        },
        now: 10_000,
        task: null,
        taskCenterHydrated: true,
      }).waitingForTaskRecord,
    ).toBe(true);
  });

  it('does not trust stale keyed local state after task-center hydration', () => {
    expect(
      resolveNodeGenerationTaskState({
        data: {
          generationStartedAt: 1_000,
          generationTaskKey: 'task-1',
          isGenerating: true,
        },
        now: 20_000,
        task: null,
        taskCenterHydrated: true,
      }).isGenerating,
    ).toBe(false);
  });

  it('uses an active task as the authoritative generating state', () => {
    expect(
      resolveNodeGenerationTaskState({
        data: { generationTaskKey: 'task-1' },
        task: task('running'),
        taskCenterHydrated: true,
      }),
    ).toEqual(expect.objectContaining({
      isGenerating: true,
      taskIsActive: true,
    }));
  });

  it('stops generating when the registered task is terminal', () => {
    expect(
      resolveNodeGenerationTaskState({
        data: {
          generationTaskKey: 'task-1',
          isGenerating: true,
        },
        task: task('completed'),
        taskCenterHydrated: true,
      }).isGenerating,
    ).toBe(false);
  });

  it('preserves a failed task error for node-level error synchronization', () => {
    const failedTask: CanvasNodeGenerationTask = {
      error: 'audio generation failed',
      status: 'failed',
    };

    const resolved = resolveNodeGenerationTaskState({
      data: { generationTaskKey: 'task-1' },
      task: failedTask,
      taskCenterHydrated: true,
    });

    expect(resolved.task).toBe(failedTask);
    expect(resolved.taskIsActive).toBe(false);
  });
});
