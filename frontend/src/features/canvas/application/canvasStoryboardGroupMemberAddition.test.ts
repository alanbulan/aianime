// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import type { NodeFactory } from './ports';
import { addCanvasStoryboardGroupMembers } from './canvasStoryboardGroupMemberAddition';

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

function factory(...ids: string[]): NodeFactory {
  let index = 0;
  return {
    createNode: (type, position, data = {}) => ({
      id: ids[index++] ?? `created-${index}`,
      type,
      position,
      data,
    }) as CanvasNode,
  };
}

describe('Canvas storyboard member addition', () => {
  it('returns null for empty images or an ordinary group', () => {
    const ordinary = node('ordinary', { type: CANVAS_NODE_TYPES.group });
    expect(
      addCanvasStoryboardGroupMembers(
        [ordinary],
        ordinary.id,
        [{ imageUrl: '  ' }],
        factory('image'),
      ),
    ).toBeNull();
    expect(
      addCanvasStoryboardGroupMembers(
        [ordinary],
        ordinary.id,
        [{ imageUrl: '/image.png' }],
        factory('image'),
      ),
    ).toBeNull();
  });

  it('creates hidden images using fallback dimensions and expands the board', () => {
    const group = node('group', {
      type: CANVAS_NODE_TYPES.group,
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
      factory('first', 'second'),
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
      type: CANVAS_NODE_TYPES.exportImage,
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
