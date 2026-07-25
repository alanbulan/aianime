// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from './canvasNodes';
import { convertCanvasStoryboardGroupToPlain } from './canvasStoryboardGroupConversion';

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

describe('Canvas storyboard group conversion', () => {
  it('returns null for a missing or ordinary group', () => {
    const ordinary = node('ordinary', { type: CANVAS_NODE_TYPES.group });
    expect(
      convertCanvasStoryboardGroupToPlain([ordinary], [], 'missing'),
    ).toBeNull();
    expect(
      convertCanvasStoryboardGroupToPlain([ordinary], [], ordinary.id),
    ).toBeNull();
  });

  it('reveals members, strips storyboard data, and restores edges', () => {
    const group = node('group', {
      type: CANVAS_NODE_TYPES.group,
      dragHandle: '.storyboard-group-drag-handle',
      style: { borderColor: 'red', width: 100, height: 100 },
      data: {
        label: 'Shots',
        storyboardGroup: true,
        storyboardAspect: '16:9',
        storyboardCols: 2,
        storyboardShowIndex: true,
        storyboardBaseWidth: 300,
        storyboardBaseHeight: 200,
      },
    });
    const first = node('first', {
      parentId: group.id,
      hidden: true,
      position: { x: 12, y: 34 },
    });
    const second = node('second', {
      parentId: group.id,
      hidden: true,
      position: { x: 376, y: 34 },
    });
    const outside = node('outside');
    const edges: CanvasEdge[] = [
      {
        id: 'outgoing',
        source: group.id,
        target: outside.id,
        data: { __sbOrigSource: first.id, role: 'output' },
      },
      {
        id: 'incoming',
        source: outside.id,
        target: group.id,
        data: { __sbOrigTarget: second.id, role: 'input' },
      },
      {
        id: 'internal',
        source: first.id,
        target: second.id,
        hidden: true,
      },
    ];

    const result = convertCanvasStoryboardGroupToPlain(
      [group, first, second, outside],
      edges,
      group.id,
    );

    expect(result?.nodes[0]).toMatchObject({
      dragHandle: undefined,
      width: 696,
      height: 254,
      style: { borderColor: 'red', width: 696, height: 254 },
      data: { label: 'Shots' },
    });
    expect(result?.nodes[0]?.data).not.toHaveProperty('storyboardGroup');
    expect(result?.nodes.slice(1, 3).every((item) => !item.hidden)).toBe(true);
    expect(result?.edges).toEqual([
      expect.objectContaining({
        id: 'outgoing',
        source: first.id,
        data: { role: 'output' },
      }),
      expect.objectContaining({
        id: 'incoming',
        target: second.id,
        data: { role: 'input' },
      }),
      expect.objectContaining({ id: 'internal', hidden: false }),
    ]);
  });
});
