// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from './canvasNodes';
import { reorderCanvasStoryboardGroupMember } from './canvasStoryboardGroupMembers';

function node(
  id: string,
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    measured: { width: 300, height: 200 },
    data: {},
    ...overrides,
  } as CanvasNode;
}

describe('Canvas storyboard member reordering', () => {
  it('returns null for invalid groups and indexes', () => {
    const ordinary = node('ordinary', { type: CANVAS_NODE_TYPES.group });
    const member = node('member', { parentId: ordinary.id });

    expect(
      reorderCanvasStoryboardGroupMember(
        [ordinary, member],
        ordinary.id,
        0,
        1,
      ),
    ).toBeNull();

    const storyboard = node('storyboard', {
      type: CANVAS_NODE_TYPES.group,
      data: { storyboardGroup: true },
    });
    expect(
      reorderCanvasStoryboardGroupMember(
        [storyboard, { ...member, parentId: storyboard.id }],
        storyboard.id,
        0,
        0,
      ),
    ).toBeNull();
    expect(
      reorderCanvasStoryboardGroupMember(
        [storyboard, { ...member, parentId: storyboard.id }],
        storyboard.id,
        -1,
        0,
      ),
    ).toBeNull();
  });

  it('moves a reading-order member and reassigns full-grid positions', () => {
    const group = node('group', {
      type: CANVAS_NODE_TYPES.group,
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
