// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import { useCanvasBeatContextPrefetch } from './useCanvasBeatContextPrefetch';

function beatContextNode(
  id: string,
  episode: number,
  position = { x: 0, y: 0 },
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.beatContext,
    position,
    data: { episode },
  } as CanvasNode;
}

describe('useCanvasBeatContextPrefetch', () => {
  it('prefetches every referenced episode', () => {
    const prefetchEpisode = vi.fn();
    renderHook(() => useCanvasBeatContextPrefetch({
      nodes: [
        beatContextNode('node-1', 1),
        beatContextNode('node-2', 2),
      ],
      defaultProjectId: 'project-1',
      prefetchEpisode,
    }));

    expect(prefetchEpisode).toHaveBeenNthCalledWith(1, {
      projectId: 'project-1',
      episode: 1,
    });
    expect(prefetchEpisode).toHaveBeenNthCalledWith(2, {
      projectId: 'project-1',
      episode: 2,
    });
  });

  it('does not prefetch again when only unrelated node state changes', () => {
    const prefetchEpisode = vi.fn();
    const { rerender } = renderHook(
      ({ nodes }) => useCanvasBeatContextPrefetch({
        nodes,
        defaultProjectId: 'project-1',
        prefetchEpisode,
      }),
      { initialProps: { nodes: [beatContextNode('node-1', 1)] } },
    );

    rerender({ nodes: [beatContextNode('node-1', 1, { x: 100, y: 80 })] });
    expect(prefetchEpisode).toHaveBeenCalledOnce();

    rerender({ nodes: [
      beatContextNode('node-1', 1, { x: 100, y: 80 }),
      beatContextNode('node-2', 2),
    ] });
    expect(prefetchEpisode).toHaveBeenCalledTimes(3);
  });
});
