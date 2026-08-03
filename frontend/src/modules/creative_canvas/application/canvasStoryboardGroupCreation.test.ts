// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { createCanvasStoryboardGroup } from './canvasStoryboardGroupCreation';

interface TestNode {
  id: string;
  kind: 'group' | 'node';
  parentId?: string;
  selected?: boolean;
  extent?: unknown;
  hidden?: boolean;
  dragHandle?: string;
  position: { x: number; y: number };
  measured: { width: number; height: number };
  width?: number;
  height?: number;
  style?: Record<string, unknown>;
  data: Record<string, unknown>;
}

interface TestEdge {
  id: string;
  source: string;
  target: string;
  data?: Record<string, unknown>;
  hidden?: boolean;
}

function node(
  id: string,
  overrides: Partial<TestNode> = {},
): TestNode {
  return {
    id,
    kind: 'node',
    position: { x: 0, y: 0 },
    measured: { width: 300, height: 200 },
    data: { imageUrl: `/${id}.png` },
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
    defaultNodeWidth: 320,
    getNodeSize: (candidate: TestNode) => candidate.measured,
    isStoryboardGroupNode: (candidate: TestNode) =>
      candidate.kind === 'group' && candidate.data.storyboardGroup === true,
    resolveAbsolutePosition,
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
        ports('group'),
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
    const edges: TestEdge[] = [
      { id: 'internal', source: first.id, target: second.id },
      { id: 'outgoing', source: second.id, target: external.id },
      { id: 'incoming', source: external.id, target: first.id },
    ];

    const result = createCanvasStoryboardGroup(
      [external, second, first],
      edges,
      [second.id, first.id],
      ports('storyboard-group'),
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
      kind: 'group',
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
