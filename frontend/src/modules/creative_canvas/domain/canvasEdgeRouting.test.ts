// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { buildCanvasOrthogonalRoute } from './canvasEdgeRouting';

describe('buildCanvasOrthogonalRoute', () => {
  it('builds the direct orthogonal lane when avoidance is disabled', () => {
    expect(
      buildCanvasOrthogonalRoute({
        sourceX: 0,
        sourceY: 20,
        sourcePosition: 'right',
        targetX: 200,
        targetY: 100,
        targetPosition: 'left',
        nodes: [],
        smartAvoidance: false,
      }),
    ).toEqual({
      path: 'M 0 20 L 24 20 L 24 60 L 176 60 L 176 100 L 200 100',
      labelX: 100,
      labelY: 60,
    });
  });

  it('routes around measured obstacle rectangles in smart mode', () => {
    const route = buildCanvasOrthogonalRoute({
      sourceId: 'source',
      targetId: 'target',
      sourceX: 0,
      sourceY: 100,
      sourcePosition: 'right',
      targetX: 300,
      targetY: 100,
      targetPosition: 'left',
      nodes: [
        {
          id: 'obstacle',
          position: { x: 100, y: 50 },
          measured: { width: 100, height: 100 },
        },
      ],
      smartAvoidance: true,
    });

    expect(route.path).toContain('L 24 16 L 276 16');
    expect(route.labelY).toBe(16);
  });
});
