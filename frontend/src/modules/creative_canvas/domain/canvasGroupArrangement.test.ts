// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  arrangeCanvasGroupChildren,
  type CanvasGroupArrangementMode,
} from './canvasGroupArrangement';

interface TestNode {
  id: string;
  kind: 'group' | 'node';
  parentId?: string;
  position: { x: number; y: number };
  measured: { width: number; height: number };
  width?: number;
  height?: number;
  style?: Record<string, unknown>;
  data: Record<string, unknown>;
}

const ports = {
  isGroupNode: (candidate: TestNode) => candidate.kind === 'group',
  isProtectedGroupNode: (candidate: TestNode) =>
    typeof candidate.data.projection_key === 'string',
  isStoryboardGroupNode: (candidate: TestNode) =>
    candidate.data.storyboardGroup === true,
  getNodeSize: (candidate: TestNode) => candidate.measured,
};

function node(
  id: string,
  overrides: Partial<TestNode> = {},
): TestNode {
  return {
    id,
    kind: 'node',
    position: { x: 0, y: 0 },
    measured: { width: 100, height: 100 },
    data: {},
    ...overrides,
  };
}

function graph(): TestNode[] {
  const group = node('group', {
    kind: 'group',
    style: { borderColor: 'red' },
  });
  return [
    group,
    node('first', {
      parentId: group.id,
      position: { x: 500, y: 0 },
      measured: { width: 100, height: 50 },
    }),
    node('second', {
      parentId: group.id,
      position: { x: 0, y: 100 },
      measured: { width: 80, height: 120 },
    }),
    node('third', {
      parentId: group.id,
      position: { x: 200, y: 100 },
      measured: { width: 120, height: 60 },
    }),
  ];
}

describe('Canvas group arrangement', () => {
  it('rejects invalid, protected, and undersized groups', () => {
    const ordinary = node('ordinary');
    const group = node('group', { kind: 'group' });
    const projection = node('projection', {
      kind: 'group',
      data: { projection_key: 'beat:1:4' },
    });

    expect(
      arrangeCanvasGroupChildren(
        [ordinary],
        ordinary.id,
        'horizontal',
        ports,
      ),
    ).toBeNull();
    expect(
      arrangeCanvasGroupChildren(
        [group, node('only', { parentId: group.id })],
        group.id,
        'horizontal',
        ports,
      ),
    ).toBeNull();
    expect(
      arrangeCanvasGroupChildren(
        [projection, node('child', { parentId: projection.id })],
        projection.id,
        'grid',
        ports,
      ),
    ).toBeNull();
  });

  it.each<{
    mode: CanvasGroupArrangementMode;
    positions: Array<{ x: number; y: number }>;
    size: { width: number; height: number };
  }>([
    {
      mode: 'horizontal',
      positions: [{ x: 20, y: 34 }, { x: 152, y: 34 }, { x: 264, y: 34 }],
      size: { width: 404, height: 174 },
    },
    {
      mode: 'vertical',
      positions: [{ x: 20, y: 34 }, { x: 20, y: 116 }, { x: 20, y: 268 }],
      size: { width: 160, height: 348 },
    },
    {
      mode: 'grid',
      positions: [{ x: 20, y: 34 }, { x: 172, y: 34 }, { x: 20, y: 186 }],
      size: { width: 272, height: 266 },
    },
  ])('arranges children in $mode mode and tightens the group', ({ mode, positions, size }) => {
    const result = arrangeCanvasGroupChildren(graph(), 'group', mode, ports);

    expect(result?.[0]).toMatchObject({
      ...size,
      style: { borderColor: 'red', ...size },
    });
    expect(result?.slice(1).map((item) => item.position)).toEqual(positions);
  });
});
