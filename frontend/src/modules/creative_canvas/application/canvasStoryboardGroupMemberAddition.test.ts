// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { addCanvasStoryboardGroupMembers } from './canvasStoryboardGroupMemberAddition';

interface TestNode {
  id: string;
  kind: 'group' | 'node';
  nodeType?: 'exportImage';
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

function node(
  id: string,
  overrides: Partial<TestNode> = {},
): TestNode {
  return {
    id,
    kind: 'node',
    position: { x: 0, y: 0 },
    measured: { width: 320, height: 200 },
    data: {},
    ...overrides,
  };
}

function ports(...ids: string[]) {
  let index = 0;
  return {
    createMemberNode: (data: Record<string, unknown>) =>
      node(ids[index++] ?? `created-${index}`, {
        nodeType: 'exportImage',
        data,
      }),
    defaultNodeWidth: 320,
    getNodeSize: (candidate: TestNode) => candidate.measured,
    isStoryboardGroupNode: (candidate: TestNode) =>
      candidate.kind === 'group' && candidate.data.storyboardGroup === true,
  };
}

describe('Canvas storyboard member addition', () => {
  it('returns null for empty images or an ordinary group', () => {
    const ordinary = node('ordinary', { kind: 'group' });
    expect(
      addCanvasStoryboardGroupMembers(
        [ordinary],
        ordinary.id,
        [{ imageUrl: '  ' }],
        ports('image'),
      ),
    ).toBeNull();
    expect(
      addCanvasStoryboardGroupMembers(
        [ordinary],
        ordinary.id,
        [{ imageUrl: '/image.png' }],
        ports('image'),
      ),
    ).toBeNull();
  });

  it('creates hidden images using fallback dimensions and expands the board', () => {
    const group = node('group', {
      kind: 'group',
      style: { borderColor: 'red' },
      data: {
        storyboardGroup: true,
        storyboardAspect: '16:9',
      },
    });
    const outside = node('outside', { position: { x: 900, y: 900 } });

    const result = addCanvasStoryboardGroupMembers(
      [group, outside],
      group.id,
      [
        { imageUrl: '  ' },
        { imageUrl: '/image.png' },
        {
          imageUrl: '/second.png',
          previewImageUrl: '/second-preview.png',
          displayName: 'Second',
        },
      ],
      ports('first', 'second'),
    );

    expect(result?.createdNodeIds).toEqual(['first', 'second']);
    expect(result?.nodes[0]).toMatchObject({
      id: group.id,
      width: 1152,
      height: 361,
      style: { borderColor: 'red', width: 1152, height: 361 },
      data: { storyboardCols: 2 },
    });
    expect(result?.nodes[1]).toBe(outside);
    expect(result?.nodes[2]).toMatchObject({
      id: 'first',
      nodeType: 'exportImage',
      parentId: group.id,
      hidden: true,
      selected: false,
      position: { x: 12, y: 34 },
      width: 320,
      height: 200,
      style: { width: 320, height: 200 },
      data: {
        imageUrl: '/image.png',
        previewImageUrl: '/image.png',
        displayName: '分镜',
      },
    });
    expect(result?.nodes[3]).toMatchObject({
      id: 'second',
      position: { x: 376, y: 34 },
      data: {
        previewImageUrl: '/second-preview.png',
        displayName: 'Second',
      },
    });
  });
});
