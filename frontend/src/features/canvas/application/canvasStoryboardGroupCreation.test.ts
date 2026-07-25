// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import type { NodeFactory } from './ports';
import { createCanvasStoryboardGroup } from './canvasStoryboardGroupCreation';

function node(
  id: string,
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.imageEdit,
    position: { x: 0, y: 0 },
    measured: { width: 300, height: 200 },
    data: { imageUrl: `/${id}.png` },
    ...overrides,
  } as CanvasNode;
}

function factory(id: string): NodeFactory {
  return {
    createNode: (type, position, data = {}) => ({
      id,
      type,
      position,
      data,
    }) as CanvasNode,
  };
}

describe('Canvas storyboard group creation', () => {
  it('returns null with fewer than two top-level existing members', () => {
    const only = node('only');
    expect(
      createCanvasStoryboardGroup(
        [only],
        [],
        [only.id, 'missing'],
        factory('group'),
      ),
    ).toBeNull();
  });

  it('orders hidden members and projects their edges through the group', () => {
    const external = node('external', {
      position: { x: 0, y: 600 },
      selected: true,
    });
    const second = node('second', {
      position: { x: 400, y: 0 },
      selected: true,
    });
    const first = node('first', {
      position: { x: 0, y: 0 },
      selected: true,
    });
    const edges: CanvasEdge[] = [
      { id: 'internal', source: first.id, target: second.id },
      { id: 'outgoing', source: second.id, target: external.id },
      { id: 'incoming', source: external.id, target: first.id },
    ];

    const result = createCanvasStoryboardGroup(
      [external, second, first],
      edges,
      [second.id, first.id],
      factory('storyboard-group'),
    );

    expect(result?.groupedNodeIds).toEqual(new Set([second.id, first.id]));
    expect(result?.nodes.map((item) => item.id)).toEqual([
      external.id,
      'storyboard-group',
      second.id,
      first.id,
    ]);
    expect(result?.nodes[0]?.selected).toBe(false);
    expect(result?.nodes[1]).toMatchObject({
      type: CANVAS_NODE_TYPES.group,
      position: { x: 0, y: 0 },
      style: { width: 1152, height: 361 },
      dragHandle: '.storyboard-group-drag-handle',
      selected: true,
      data: {
        label: '分镜组 1',
        displayName: '分镜组 1',
        storyboardGroup: true,
        storyboardAspect: '16:9',
        storyboardCols: 2,
        storyboardShowIndex: false,
        storyboardBaseWidth: 300,
        storyboardBaseHeight: 200,
      },
    });
    expect(result?.nodes.find((item) => item.id === first.id)).toMatchObject({
      parentId: 'storyboard-group',
      hidden: true,
      position: { x: 12, y: 34 },
      selected: false,
    });
    expect(result?.nodes.find((item) => item.id === second.id)).toMatchObject({
      parentId: 'storyboard-group',
      hidden: true,
      position: { x: 376, y: 34 },
      selected: false,
    });
    expect(result?.edges).toEqual([
      expect.objectContaining({ id: 'internal', hidden: true }),
      expect.objectContaining({
        id: 'outgoing',
        source: 'storyboard-group',
        data: { __sbOrigSource: second.id },
      }),
      expect.objectContaining({
        id: 'incoming',
        target: 'storyboard-group',
        data: { __sbOrigTarget: first.id },
      }),
    ]);
  });
});
