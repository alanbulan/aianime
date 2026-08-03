// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { updateCanvasNodeSize } from './canvasNodeSize';

interface TestCanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  style?: { width?: number; height?: number; opacity?: number };
  data: Record<string, unknown>;
}

function node(overrides: Partial<TestCanvasNode> = {}): TestCanvasNode {
  return {
    id: 'node',
    type: 'imageGenNode',
    position: { x: 0, y: 0 },
    width: 300,
    height: 200,
    style: { width: 300, height: 200, opacity: 0.5 },
    data: { isSizeManuallyAdjusted: false, aspectRatio: '3:2' },
    ...overrides,
  };
}

describe('Canvas node size updates', () => {
  it('rounds and clamps dimensions while synchronizing explicit and style sizes', () => {
    const target = node();
    const result = updateCanvasNodeSize(
      [target],
      target.id,
      { width: 420.6, height: 0.2 },
    );

    expect(result.changed).toBe(true);
    expect(result.nodes[0]).toMatchObject({
      width: 421,
      height: 1,
      style: { width: 421, height: 1, opacity: 0.5 },
    });
  });

  it('uses explicit size before style and returns the original graph for a no-op', () => {
    const target = node({
      width: 300,
      height: 200,
      style: { width: 999, height: 999 },
    });
    const nodes = [target];

    expect(
      updateCanvasNodeSize(nodes, target.id, { width: 300, height: 200 }),
    ).toEqual({ nodes, changed: false });
    expect(
      updateCanvasNodeSize(nodes, 'missing', { width: 10, height: 10 }),
    ).toEqual({ nodes, changed: false });
  });

  it('falls back to numeric style dimensions when explicit size is absent', () => {
    const target = node({
      width: undefined,
      height: undefined,
      style: { width: 320, height: 180 },
    });
    const nodes = [target];

    expect(
      updateCanvasNodeSize(nodes, target.id, { width: 320, height: 180 }),
    ).toEqual({ nodes, changed: false });
  });

  it('merges data and lets lockManualSize override the same data field', () => {
    const target = node();
    const result = updateCanvasNodeSize(
      [target],
      target.id,
      { width: 300, height: 200 },
      {
        lockManualSize: true,
        data: {
          aspectRatio: '16:9',
          isSizeManuallyAdjusted: false,
        },
      },
    );

    expect(result.changed).toBe(true);
    expect(result.nodes[0]?.data).toMatchObject({
      aspectRatio: '16:9',
      isSizeManuallyAdjusted: true,
    });
  });
});
