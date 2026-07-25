// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from './canvasNodes';
import {
  arrangeCanvasGroupChildren,
  type CanvasGroupArrangementMode,
} from './canvasGroupArrangement';

function node(
  id: string,
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    measured: { width: 100, height: 100 },
    data: {},
    ...overrides,
  } as CanvasNode;
}

function graph(): CanvasNode[] {
  const group = node('group', {
    type: CANVAS_NODE_TYPES.group,
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
    const group = node('group', { type: CANVAS_NODE_TYPES.group });
    const projection = node('projection', {
      type: CANVAS_NODE_TYPES.group,
      data: { projection_key: 'beat:1:4' },
    });

    expect(
      arrangeCanvasGroupChildren([ordinary], ordinary.id, 'horizontal'),
    ).toBeNull();
    expect(
      arrangeCanvasGroupChildren(
        [group, node('only', { parentId: group.id })],
        group.id,
        'horizontal',
      ),
    ).toBeNull();
    expect(
      arrangeCanvasGroupChildren(
        [projection, node('child', { parentId: projection.id })],
        projection.id,
        'grid',
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
    const result = arrangeCanvasGroupChildren(graph(), 'group', mode);

    expect(result?.[0]).toMatchObject({
      ...size,
      style: { borderColor: 'red', ...size },
    });
    expect(result?.slice(1).map((item) => item.position)).toEqual(positions);
  });
});
