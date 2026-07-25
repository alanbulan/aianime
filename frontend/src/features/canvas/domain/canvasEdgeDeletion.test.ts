// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type { CanvasEdge } from './canvasNodes';
import { deleteCanvasEdge } from './canvasEdgeDeletion';

function edge(
  id: string,
  data?: Record<string, unknown>,
): CanvasEdge {
  return {
    id,
    source: `${id}-source`,
    target: `${id}-target`,
    data,
  };
}

describe('Canvas edge deletion', () => {
  it('returns null when the edge does not exist', () => {
    expect(deleteCanvasEdge([edge('kept')], 'missing')).toBeNull();
  });

  it('rejects backend-managed edges', () => {
    const preset = edge('preset', { preset_managed: true });
    const projection = edge('projection', { projection_key: 'beat:1:4' });

    expect(deleteCanvasEdge([preset], preset.id)).toBeNull();
    expect(deleteCanvasEdge([projection], projection.id)).toBeNull();
  });

  it('removes only the requested user edge', () => {
    const kept = edge('kept');
    const removed = edge('removed', {
      preset_managed: true,
      user_spawned: true,
    });

    expect(deleteCanvasEdge([kept, removed], removed.id)).toEqual([kept]);
  });
});
