// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { createCanvasNodeGroup } from './canvasGroupCreation';

interface TestNode {
  id: string;
  kind: 'group' | 'node';
  parentId?: string;
  selected?: boolean;
  extent?: unknown;
  position: { x: number; y: number };
  measured: { width: number; height: number };
  width?: number;
  height?: number;
  style?: Record<string, unknown>;
  data: Record<string, unknown>;
}

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

function resolveAbsolutePosition(
  candidate: TestNode,
  nodeMap: ReadonlyMap<string, TestNode>,
): { x: number; y: number } {
  let x = candidate.position.x;
  let y = candidate.position.y;
  let parentId = candidate.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodeMap.get(parentId);
    if (!parent) {
      break;
    }
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

function ports(id: string) {
  return {
    createGroupNode: (
      position: { x: number; y: number },
      data: Record<string, unknown>,
    ) => node(id, { kind: 'group', position, data }),
    getNodeSize: (candidate: TestNode) => candidate.measured,
    isGroupNode: (candidate: TestNode) => candidate.kind === 'group',
    resolveAbsolutePosition,
  };
}

describe('Canvas group creation', () => {
  it('requires at least two top-level existing members', () => {
    const parent = node('parent', { kind: 'group' });
    const child = node('child', { parentId: parent.id });

    expect(
      createCanvasNodeGroup(
        [parent, child],
        [parent.id, child.id],
        undefined,
        ports('group'),
      ),
    ).toBeNull();
    expect(
      createCanvasNodeGroup(
        [parent],
        [parent.id, 'missing'],
        undefined,
        ports('group'),
      ),
    ).toBeNull();
  });

  it('creates a parent-first group from absolute member bounds', () => {
    const unrelated = node('unrelated', { selected: true });
    const parent = node('parent', {
      kind: 'group',
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
      ports('created-group'),
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
      kind: 'group',
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
      ports('group'),
    );

    expect(result?.nodes[0]).toMatchObject({
      position: { x: 60, y: 46 },
      width: 380,
      height: 194,
      data: { label: 'Shots', displayName: 'Shots' },
    });
  });
});
