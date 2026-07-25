// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from './canvasNodes';
import { planCanvasAutoGroupSpawn } from './canvasAutoGrouping';

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

describe('Canvas automatic grouping', () => {
  it('returns null for a missing source or without free spawned nodes', () => {
    const source = node('source');
    const attached = node('attached', { parentId: 'existing-group' });

    expect(
      planCanvasAutoGroupSpawn([source, attached], 'missing', [attached.id]),
    ).toBeNull();
    expect(
      planCanvasAutoGroupSpawn([source, attached], source.id, [attached.id]),
    ).toBeNull();
  });

  it('plans a new group when the source has no enclosing group', () => {
    const source = node('source');
    const free = node('free');
    const attached = node('attached', { parentId: 'other-group' });

    expect(
      planCanvasAutoGroupSpawn(
        [source, free, attached],
        source.id,
        [free.id, attached.id],
      ),
    ).toEqual({ kind: 'create_group', nodeIds: [source.id, free.id] });
  });

  it('appends free nodes to the nearest ordinary ancestor group', () => {
    const group = node('group', { type: CANVAS_NODE_TYPES.group });
    const wrapper = node('wrapper', { parentId: group.id });
    const source = node('source', { parentId: wrapper.id });
    const free = node('free', {
      position: { x: 450, y: 80 },
      extent: 'parent',
    });
    const attached = node('attached', { parentId: 'other-group' });
    const nodes = [group, wrapper, source, free, attached];

    const plan = planCanvasAutoGroupSpawn(
      nodes,
      source.id,
      [free.id, attached.id],
    );

    expect(plan?.kind).toBe('append_to_group');
    if (plan?.kind !== 'append_to_group') {
      throw new Error('expected append plan');
    }
    expect(plan.groupNodeId).toBe(group.id);
    expect(plan.nodes.find((item) => item.id === free.id)).toMatchObject({
      parentId: group.id,
      extent: undefined,
      position: free.position,
    });
    expect(plan.nodes.find((item) => item.id === attached.id)).toBe(attached);
  });

  it.each([
    { storyboardGroup: true },
    { projection_key: 'beat:1:4' },
  ])('rejects protected enclosing group data %o', (data) => {
    const group = node('group', {
      type: CANVAS_NODE_TYPES.group,
      data,
    });
    const source = node('source', { parentId: group.id });
    const free = node('free');

    expect(
      planCanvasAutoGroupSpawn([group, source, free], source.id, [free.id]),
    ).toBeNull();
  });
});
