// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { fitCanvasGroupToChildren } from './canvasGroupFit';

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

describe('Canvas group fitting', () => {
  it('rejects non-groups, protected groups, and groups without children', () => {
    const ordinary = node('ordinary');
    const emptyGroup = node('empty', { kind: 'group' });
    const storyboard = node('storyboard', {
      kind: 'group',
      data: { storyboardGroup: true },
    });
    const projection = node('projection', {
      kind: 'group',
      data: { projection_key: 'beat:1:4' },
    });

    expect(
      fitCanvasGroupToChildren([ordinary], ordinary.id, ports),
    ).toBeNull();
    expect(
      fitCanvasGroupToChildren([emptyGroup], emptyGroup.id, ports),
    ).toBeNull();
    expect(
      fitCanvasGroupToChildren(
        [storyboard, node('story-child', { parentId: storyboard.id })],
        storyboard.id,
        ports,
      ),
    ).toBeNull();
    expect(
      fitCanvasGroupToChildren(
        [projection, node('projection-child', { parentId: projection.id })],
        projection.id,
        ports,
      ),
    ).toBeNull();
  });

  it('shifts top-left overflow inward and grows without shrinking width', () => {
    const group = node('group', {
      kind: 'group',
      position: { x: 100, y: 100 },
      width: 220,
      height: 140,
      style: { borderColor: 'red', width: 220, height: 140 },
    });
    const child = node('child', {
      parentId: group.id,
      position: { x: -10, y: -20 },
    });

    const result = fitCanvasGroupToChildren([group, child], group.id, ports);

    expect(result?.[0]).toMatchObject({
      position: { x: 70, y: 46 },
      width: 220,
      height: 154,
      style: { borderColor: 'red', width: 220, height: 154 },
    });
    expect(result?.[1]?.position).toEqual({ x: 20, y: 34 });
  });

  it('grows to contain right-bottom overflow and returns null when it fits', () => {
    const group = node('group', {
      kind: 'group',
      width: 220,
      height: 140,
      style: { width: 220, height: 140 },
    });
    const child = node('child', {
      parentId: group.id,
      position: { x: 300, y: 200 },
    });
    const grown = fitCanvasGroupToChildren([group, child], group.id, ports);

    expect(grown?.[0]).toMatchObject({ width: 420, height: 320 });
    expect(grown?.[1]).toBe(child);
    expect(
      fitCanvasGroupToChildren(grown ?? [], group.id, ports),
    ).toBeNull();
  });
});
