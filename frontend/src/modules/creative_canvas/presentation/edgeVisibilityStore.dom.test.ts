// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from 'vitest';

import { useEdgeVisibilityStore } from './edgeVisibilityStore';

describe('useEdgeVisibilityStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useEdgeVisibilityStore.setState({ hidden: false });
  });

  it('toggles and persists edge visibility', () => {
    useEdgeVisibilityStore.getState().toggle();
    expect(useEdgeVisibilityStore.getState().hidden).toBe(true);
    expect(window.localStorage.getItem('canvas.edges.hidden')).toBe('1');

    useEdgeVisibilityStore.getState().toggle();
    expect(useEdgeVisibilityStore.getState().hidden).toBe(false);
    expect(window.localStorage.getItem('canvas.edges.hidden')).toBe('0');
  });
});
