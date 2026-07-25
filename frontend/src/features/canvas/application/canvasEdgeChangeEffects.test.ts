// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type { CanvasEdge } from '../domain/canvasNodes';
import {
  applyCanvasEdgeChangeEffects,
  type CanvasEdgeChangeEffectState,
} from './canvasEdgeChangeEffects';

const edge: CanvasEdge = {
  id: 'edge',
  source: 'source',
  target: 'target',
};

function state(): CanvasEdgeChangeEffectState {
  return {
    nodes: [],
    edges: [edge],
    history: { past: [], future: [] },
    dragHistorySnapshot: null,
    userEditsSinceHydrate: 0,
    lastMutationSource: null,
    pendingClearIntent: false,
  };
}

describe('Canvas edge change effects', () => {
  it('keeps edge selection view-only', () => {
    const selected = { ...edge, selected: true };
    const result = applyCanvasEdgeChangeEffects(
      state(),
      [selected],
      [{ type: 'select' }],
    );

    expect(result).toEqual({ edges: [selected] });
  });

  it('records a graph edit and clears redo history', () => {
    const currentState = state();
    currentState.history.future = [{ nodes: [], edges: [edge] }];

    const result = applyCanvasEdgeChangeEffects(
      currentState,
      [],
      [{ type: 'remove' }],
    );

    expect(result.edges).toEqual([]);
    expect(result.history?.past).toEqual([{ nodes: [], edges: [edge] }]);
    expect(result.history?.future).toEqual([]);
    expect(result.dragHistorySnapshot).toBeNull();
    expect(result.userEditsSinceHydrate).toBe(1);
    expect(result.lastMutationSource).toBe('user_edit');
  });
});
