// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createUseDetachUpstream,
  type CanvasUpstreamEdgeDeletion,
} from './useDetachUpstream';

describe('createUseDetachUpstream', () => {
  it('reads the latest graph when the command runs and deletes every match', () => {
    const deleteEdge: CanvasUpstreamEdgeDeletion = vi.fn();
    let edges = [
      { id: 'initial', source: 'source-a', target: 'target-a' },
    ];
    const useDetachUpstream = createUseDetachUpstream({
      useDeleteEdge: () => deleteEdge,
      readEdges: () => edges,
    });
    const { result } = renderHook(() => useDetachUpstream('target-a'));

    edges = [
      { id: 'match-a', source: 'source-a', target: 'target-a' },
      { id: 'match-b', source: 'source-a', target: 'target-a' },
      { id: 'kept', source: 'source-b', target: 'target-a' },
    ];
    act(() => result.current('source-a'));

    expect(deleteEdge).toHaveBeenCalledTimes(2);
    expect(deleteEdge).toHaveBeenNthCalledWith(1, 'match-a');
    expect(deleteEdge).toHaveBeenNthCalledWith(2, 'match-b');
  });

  it('does not issue a deletion when no matching reference exists', () => {
    const deleteEdge: CanvasUpstreamEdgeDeletion = vi.fn();
    const useDetachUpstream = createUseDetachUpstream({
      useDeleteEdge: () => deleteEdge,
      readEdges: () => [
        { id: 'kept', source: 'source-b', target: 'target-a' },
      ],
    });
    const { result } = renderHook(() => useDetachUpstream('target-a'));

    act(() => result.current('source-a'));

    expect(deleteEdge).not.toHaveBeenCalled();
  });
});
