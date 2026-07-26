// Copyright (c) 2026 AI anime
import type { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import { useCanvasProjectContextController } from './useCanvasProjectContextController';

const urlMocks = vi.hoisted(() => ({
  readUrl: vi.fn(),
}));
const narrativeMocks = vi.hoisted(() => ({
  prefetchEpisodeBeats: vi.fn(),
  prefetchEpisodeDetail: vi.fn(),
}));

vi.mock('@/lib/url-params', () => urlMocks);
vi.mock('@/modules/narrative_planning/public', () => narrativeMocks);

function beatContextNode(): CanvasNode {
  return {
    id: 'beat-context-1',
    type: CANVAS_NODE_TYPES.beatContext,
    position: { x: 0, y: 0 },
    data: { episode: 3 },
  } as CanvasNode;
}

describe('useCanvasProjectContextController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    urlMocks.readUrl.mockReturnValue({
      project: 'project-1',
      canvas: 'canvas-1',
    });
  });

  it('resolves the project once and prefetches both episode resources', () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ nodes }) => useCanvasProjectContextController({ nodes }),
      {
        initialProps: { nodes: [beatContextNode()] },
        wrapper,
      },
    );

    expect(result.current.projectId).toBe('project-1');
    expect(urlMocks.readUrl).toHaveBeenCalledOnce();
    expect(narrativeMocks.prefetchEpisodeBeats).toHaveBeenCalledWith(
      queryClient,
      'project-1',
      3,
    );
    expect(narrativeMocks.prefetchEpisodeDetail).toHaveBeenCalledWith(
      queryClient,
      'project-1',
      3,
    );

    rerender({ nodes: [beatContextNode()] });
    expect(urlMocks.readUrl).toHaveBeenCalledOnce();
  });
});
