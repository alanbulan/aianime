// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { reorderCanvasStoryboardGroupMember } from './canvasStoryboardGroupMembers';

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
  defaultNodeWidth: 320,
  getNodeSize: (candidate: TestNode) => candidate.measured,
  isStoryboardGroupNode: (candidate: TestNode) =>
    candidate.kind === 'group' && candidate.data.storyboardGroup === true,
};

function node(
  id: string,
  overrides: Partial<TestNode> = {},
): TestNode {
  return {
    id,
    kind: 'node',
    position: { x: 0, y: 0 },
    measured: { width: 300, height: 200 },
    data: {},
    ...overrides,
  };
}

describe('Canvas storyboard member reordering', () => {
  it('returns null for invalid groups and indexes', () => {
    const ordinary = node('ordinary', { kind: 'group' });
    const member = node('member', { parentId: ordinary.id });

    expect(
      reorderCanvasStoryboardGroupMember(
        [ordinary, member],
        ordinary.id,
        0,
        1,
        ports,
      ),
    ).toBeNull();

    const storyboard = node('storyboard', {
      kind: 'group',
      data: { storyboardGroup: true },
    });
    expect(
      reorderCanvasStoryboardGroupMember(
        [storyboard, { ...member, parentId: storyboard.id }],
        storyboard.id,
        0,
        0,
        ports,
      ),
    ).toBeNull();
    expect(
      reorderCanvasStoryboardGroupMember(
        [storyboard, { ...member, parentId: storyboard.id }],
        storyboard.id,
        -1,
        0,
        ports,
      ),
    ).toBeNull();
  });

  it('moves a reading-order member and reassigns full-grid positions', () => {
    const group = node('group', {
      kind: 'group',
      data: {
        storyboardGroup: true,
        storyboardAspect: '16:9',
        storyboardCols: 2,
        storyboardBaseWidth: 300,
        storyboardBaseHeight: 200,
      },
    });
    const first = node('first', {
      parentId: group.id,
      position: { x: 12, y: 34 },
    });
    const second = node('second', {
      parentId: group.id,
      position: { x: 376, y: 34 },
    });
    const third = node('third', {
      parentId: group.id,
      position: { x: 12, y: 242 },
    });
    const outside = node('outside', { position: { x: 900, y: 900 } });

    const result = reorderCanvasStoryboardGroupMember(
      [group, first, second, third, outside],
      group.id,
      0,
      2,
      ports,
    );

    expect(result?.find((item) => item.id === second.id)?.position).toEqual({
      x: 12,
      y: 34,
    });
    expect(result?.find((item) => item.id === third.id)?.position).toEqual({
      x: 376,
      y: 34,
    });
    expect(result?.find((item) => item.id === first.id)?.position).toEqual({
      x: 12,
      y: 242,
    });
    expect(result?.find((item) => item.id === outside.id)).toBe(outside);
  });
});
