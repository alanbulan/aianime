// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from './canvasNodes';
import { configureCanvasStoryboardGroup } from './canvasStoryboardGroupConfig';

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

describe('Canvas storyboard group configuration', () => {
  it('returns null for a missing or ordinary group', () => {
    const ordinary = node('ordinary', {
      type: CANVAS_NODE_TYPES.group,
    });

    expect(
      configureCanvasStoryboardGroup([ordinary], 'missing', {}),
    ).toBeNull();
    expect(
      configureCanvasStoryboardGroup([ordinary], ordinary.id, {}),
    ).toBeNull();
  });

  it('updates board dimensions and persisted display settings', () => {
    const group = node('group', {
      type: CANVAS_NODE_TYPES.group,
      style: { borderColor: 'red', width: 100, height: 100 },
      data: {
        storyboardGroup: true,
        storyboardAspect: '16:9',
        storyboardCols: 2,
        storyboardShowIndex: false,
      },
    });
    const children = Array.from({ length: 4 }, (_, index) =>
      node(`child-${index}`, { parentId: group.id }),
    );

    const result = configureCanvasStoryboardGroup(
      [group, ...children],
      group.id,
      { aspectKey: '4:3', cols: 4, showIndex: true },
    );

    expect(result?.[0]).toMatchObject({
      width: 2288,
      height: 466,
      style: {
        borderColor: 'red',
        width: 2288,
        height: 466,
      },
      data: {
        storyboardAspect: '4:3',
        storyboardCols: 4,
        storyboardShowIndex: true,
      },
    });
    expect(result?.slice(1)).toEqual(children);
  });

  it('keeps current settings when a patch omits them', () => {
    const group = node('group', {
      type: CANVAS_NODE_TYPES.group,
      data: {
        storyboardGroup: true,
        storyboardAspect: '1:1',
        storyboardCols: 1,
        storyboardShowIndex: true,
      },
    });
    const child = node('child', { parentId: group.id });

    expect(
      configureCanvasStoryboardGroup([group, child], group.id, {})?.[0]?.data,
    ).toMatchObject({
      storyboardAspect: '1:1',
      storyboardCols: 1,
      storyboardShowIndex: true,
    });
  });
});
