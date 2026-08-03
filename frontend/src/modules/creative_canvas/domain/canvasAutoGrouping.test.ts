// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { planCanvasAutoGroupSpawn } from './canvasAutoGrouping';

interface TestNode {
  id: string;
  kind: 'group' | 'node';
  parentId?: string;
  extent?: unknown;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

const ports = {
  isGroupNode: (candidate: TestNode) => candidate.kind === 'group',
  isProtectedGroupNode: (candidate: TestNode) =>
    typeof candidate.data.projection_key === 'string',
  isStoryboardGroupNode: (candidate: TestNode) =>
    candidate.data.storyboardGroup === true,
};

function node(
  id: string,
  overrides: Partial<TestNode> = {},
): TestNode {
  return {
    id,
    kind: 'node',
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  };
}

describe('Canvas automatic grouping', () => {
  it('returns null for a missing source or without free spawned nodes', () => {
    const source = node('source');
    const attached = node('attached', { parentId: 'existing-group' });

    expect(
      planCanvasAutoGroupSpawn(
        [source, attached],
        'missing',
        [attached.id],
        ports,
      ),
    ).toBeNull();
    expect(
      planCanvasAutoGroupSpawn(
        [source, attached],
        source.id,
        [attached.id],
        ports,
      ),
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
        ports,
      ),
    ).toEqual({ kind: 'create_group', nodeIds: [source.id, free.id] });
  });

  it('appends free nodes to the nearest ordinary ancestor group', () => {
    const group = node('group', { kind: 'group' });
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
      ports,
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
      kind: 'group',
      data,
    });
    const source = node('source', { parentId: group.id });
    const free = node('free');

    expect(
      planCanvasAutoGroupSpawn(
        [group, source, free],
        source.id,
        [free.id],
        ports,
      ),
    ).toBeNull();
  });
});
