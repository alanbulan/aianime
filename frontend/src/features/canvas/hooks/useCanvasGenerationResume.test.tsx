// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCanvasGenerationResume } from './useCanvasGenerationResume';

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('useCanvasGenerationResume', () => {
  it('requires a project and starts every pending node', () => {
    const resumeNode = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ projectId }) =>
        useCanvasGenerationResume({
          projectId,
          pendingNodeIds: ['node-1', 'node-2'],
          resumeNode,
        }),
      { initialProps: { projectId: null as string | null } },
    );

    expect(resumeNode).not.toHaveBeenCalled();
    rerender({ projectId: 'project-1' });
    expect(resumeNode).toHaveBeenNthCalledWith(1, 'node-1', 'project-1');
    expect(resumeNode).toHaveBeenNthCalledWith(2, 'node-2', 'project-1');
  });

  it('does not start an active node twice and releases it after completion', async () => {
    const firstResume = deferred();
    const resumeNode = vi.fn(() => firstResume.promise);
    const { rerender } = renderHook(
      ({ pendingNodeIds }) =>
        useCanvasGenerationResume({
          projectId: 'project-1',
          pendingNodeIds,
          resumeNode,
        }),
      { initialProps: { pendingNodeIds: ['node-1'] } },
    );

    rerender({ pendingNodeIds: ['node-1'] });
    expect(resumeNode).toHaveBeenCalledOnce();

    await act(async () => firstResume.resolve());
    rerender({ pendingNodeIds: [] });
    rerender({ pendingNodeIds: ['node-1'] });
    expect(resumeNode).toHaveBeenCalledTimes(2);
  });
});
