// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  createUseUpstreamGraph,
  type UpstreamGraphStore,
  type UpstreamGraphStoreHook,
} from './useUpstreamGraph';

interface TestNode {
  id: string;
  content: string;
  images: string[];
}

const state: UpstreamGraphStore<TestNode> = {
  nodes: [
    { id: 'late', content: 'later', images: ['/shared.png'] },
    { id: 'first', content: 'first', images: ['/a.png', '/shared.png'] },
  ],
  edges: [
    { source: 'first', target: 'target' },
    { source: 'late', target: 'target' },
  ],
};
const useStore: UpstreamGraphStoreHook<TestNode> = (selector) => selector(state);
const hooks = createUseUpstreamGraph({
  useStore,
  projectContent: (node: TestNode) => node.content,
  projectImages: (node: TestNode) => node.images,
});

describe('createUseUpstreamGraph', () => {
  it('subscribes to one-hop upstream nodes in edge order', () => {
    const { result } = renderHook(() => hooks.useUpstreamNodes('target'));

    expect(result.current.map((node) => node.id)).toEqual(['first', 'late']);
  });

  it('projects upstream contents in the same order', () => {
    const { result } = renderHook(() => hooks.useUpstreamContents('target'));

    expect(result.current).toEqual(['first', 'later']);
  });

  it('deduplicates projected images without changing their first position', () => {
    const { result } = renderHook(() => hooks.useUpstreamImages('target'));

    expect(result.current).toEqual(['/a.png', '/shared.png']);
  });
});
