// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from './canvasNodes';
import { ungroupCanvasNode } from './canvasGroupRemoval';

function node(
  id: string,
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  } as CanvasNode;
}

describe('Canvas group removal', () => {
  it('rejects missing, non-group, protected, and empty group nodes', () => {
    const ordinary = node('ordinary');
    const emptyGroup = node('empty-group', {
      type: CANVAS_NODE_TYPES.group,
    });
    const projectionGroup = node('projection-group', {
      type: CANVAS_NODE_TYPES.group,
      data: { projection_key: 'beat:1:4' },
    });
    const projectionChild = node('projection-child', {
      parentId: projectionGroup.id,
    });

    expect(ungroupCanvasNode([ordinary], [], 'missing')).toBeNull();
    expect(ungroupCanvasNode([ordinary], [], ordinary.id)).toBeNull();
    expect(ungroupCanvasNode([emptyGroup], [], emptyGroup.id)).toBeNull();
    expect(
      ungroupCanvasNode(
        [projectionGroup, projectionChild],
        [],
        projectionGroup.id,
      ),
    ).toBeNull();
  });

  it('removes the group and restores direct children to absolute positions', () => {
    const outer = node('outer', {
      type: CANVAS_NODE_TYPES.group,
      position: { x: 100.2, y: 200.2 },
    });
    const group = node('group', {
      type: CANVAS_NODE_TYPES.group,
      parentId: outer.id,
      position: { x: 20.2, y: 30.2 },
    });
    const child = node('child', {
      parentId: group.id,
      extent: 'parent',
      hidden: true,
      selected: true,
      position: { x: 5.2, y: 6.2 },
    });
    const grandchild = node('grandchild', {
      parentId: child.id,
      position: { x: 1, y: 2 },
    });
    const outside = node('outside');
    const edges: CanvasEdge[] = [
      { id: 'kept', source: child.id, target: outside.id },
      { id: 'outgoing-group', source: group.id, target: outside.id },
      { id: 'incoming-group', source: outside.id, target: group.id },
    ];

    const result = ungroupCanvasNode(
      [outer, group, child, grandchild, outside],
      edges,
      group.id,
    );

    expect(result?.nodes.some((item) => item.id === group.id)).toBe(false);
    expect(result?.nodes.find((item) => item.id === child.id)).toMatchObject({
      parentId: undefined,
      extent: undefined,
      hidden: false,
      selected: false,
      position: { x: 126, y: 237 },
    });
    expect(
      result?.nodes.find((item) => item.id === grandchild.id),
    ).toMatchObject({
      parentId: child.id,
      position: { x: 1, y: 2 },
    });
    expect(result?.edges).toEqual([edges[0]]);
  });

  it('restores storyboard endpoints and internal edges before pruning group edges', () => {
    const group = node('storyboard', {
      type: CANVAS_NODE_TYPES.group,
      data: { storyboardGroup: true },
    });
    const first = node('first', { parentId: group.id, hidden: true });
    const second = node('second', { parentId: group.id, hidden: true });
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
      {
        id: 'unrestorable',
        source: group.id,
        target: outside.id,
      },
    ];

    const result = ungroupCanvasNode(
      [group, first, second, outside],
      edges,
      group.id,
    );

    expect(result?.edges).toEqual([
      {
        id: 'outgoing',
        source: first.id,
        target: outside.id,
        data: { role: 'output' },
      },
      {
        id: 'incoming',
        source: outside.id,
        target: second.id,
        data: { role: 'input' },
      },
      {
        id: 'internal',
        source: first.id,
        target: second.id,
        hidden: false,
      },
    ]);
  });
});
