// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import type { NodeFactory } from './ports';
import { createCanvasNodeGroup } from './canvasGroupCreation';

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

describe('Canvas group creation', () => {
  it('requires at least two top-level existing members', () => {
    const parent = node('parent', { type: CANVAS_NODE_TYPES.group });
    const child = node('child', { parentId: parent.id });

    expect(
      createCanvasNodeGroup(
        [parent, child],
        [parent.id, child.id],
        undefined,
        factory('group'),
      ),
    ).toBeNull();
    expect(
      createCanvasNodeGroup(
        [parent],
        [parent.id, 'missing'],
        undefined,
        factory('group'),
      ),
    ).toBeNull();
  });

  it('creates a parent-first group from absolute member bounds', () => {
    const unrelated = node('unrelated', { selected: true });
    const parent = node('parent', {
      type: CANVAS_NODE_TYPES.group,
      position: { x: 100, y: 200 },
      selected: true,
    });
    const child = node('child', {
      parentId: parent.id,
      position: { x: 10, y: 20 },
      selected: true,
    });
    const peer = node('peer', {
      position: { x: 500, y: 250 },
      measured: { width: 200, height: 100 },
      selected: true,
    });

    const result = createCanvasNodeGroup(
      [unrelated, parent, child, peer],
      [parent.id, child.id, peer.id, peer.id],
      undefined,
      factory('created-group'),
    );

    expect(result?.groupNodeId).toBe('created-group');
    expect(result?.groupedNodeIds).toEqual(new Set([parent.id, peer.id]));
    expect(result?.nodes.map((item) => item.id)).toEqual([
      unrelated.id,
      'created-group',
      parent.id,
      child.id,
      peer.id,
    ]);
    expect(result?.nodes[0]?.selected).toBe(false);
    expect(result?.nodes[1]).toMatchObject({
      type: CANVAS_NODE_TYPES.group,
      position: { x: 80, y: 166 },
      width: 640,
      height: 204,
      style: { width: 640, height: 204 },
      selected: true,
      data: { label: '组 2', displayName: '组 2' },
    });
    expect(result?.nodes[2]).toMatchObject({
      parentId: 'created-group',
      extent: undefined,
      position: { x: 20, y: 34 },
      selected: false,
    });
    expect(result?.nodes[3]).toMatchObject({
      parentId: parent.id,
      position: { x: 10, y: 20 },
      selected: false,
    });
    expect(result?.nodes[4]).toMatchObject({
      parentId: 'created-group',
      extent: undefined,
      position: { x: 420, y: 84 },
      selected: false,
    });
  });

  it('applies a trimmed label and non-negative extra padding', () => {
    const first = node('first', { position: { x: 100, y: 100 } });
    const second = node('second', { position: { x: 300, y: 100 } });
    const result = createCanvasNodeGroup(
      [first, second],
      [first.id, second.id],
      { label: '  Shots  ', extraPadding: 20 },
      factory('group'),
    );

    expect(result?.nodes[0]).toMatchObject({
      position: { x: 60, y: 46 },
      width: 380,
      height: 194,
      data: { label: 'Shots', displayName: 'Shots' },
    });
  });
});
