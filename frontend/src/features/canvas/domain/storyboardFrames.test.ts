// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type StoryboardFrameItem,
} from './canvasNodes';
import {
  reorderStoryboardFrameInGraph,
  updateStoryboardFrameInGraph,
} from './storyboardFrames';

function frame(id: string, order: number): StoryboardFrameItem {
  return {
    id,
    imageUrl: `${id}.png`,
    note: `${id}-note`,
    order,
  };
}

function storyboardNode(frames: StoryboardFrameItem[]): CanvasNode {
  return {
    id: 'storyboard',
    type: CANVAS_NODE_TYPES.storyboardSplit,
    position: { x: 0, y: 0 },
    data: {
      aspectRatio: '16:9',
      gridRows: 1,
      gridCols: frames.length,
      frames,
    },
  } as CanvasNode;
}

describe('Storyboard frame graph rules', () => {
  it('updates only the requested frame and preserves unrelated references', () => {
    const first = frame('first', 0);
    const second = frame('second', 1);
    const source = storyboardNode([first, second]);
    const result = updateStoryboardFrameInGraph(
      [source],
      source.id,
      second.id,
      { note: 'updated', previewImageUrl: 'preview.png' },
    );

    expect(result.changed).toBe(true);
    expect(result.nodes[0]).not.toBe(source);
    const nextFrames = result.nodes[0]?.data.frames as StoryboardFrameItem[];
    expect(nextFrames[0]).toBe(first);
    expect(nextFrames[1]).toMatchObject({
      id: 'second',
      note: 'updated',
      previewImageUrl: 'preview.png',
    });
  });

  it('returns the original graph when the patch is equal or the target is missing', () => {
    const source = storyboardNode([frame('first', 0)]);
    const nodes = [source];

    expect(
      updateStoryboardFrameInGraph(nodes, source.id, 'first', {
        note: 'first-note',
      }),
    ).toEqual({ nodes, changed: false });
    expect(
      updateStoryboardFrameInGraph(nodes, source.id, 'missing', {
        note: 'updated',
      }),
    ).toEqual({ nodes, changed: false });
  });

  it('orders frames before moving and then assigns contiguous order values', () => {
    const source = storyboardNode([
      frame('last', 2),
      frame('first', 0),
      frame('middle', 1),
    ]);
    const result = reorderStoryboardFrameInGraph(
      [source],
      source.id,
      'last',
      'first',
    );

    expect(result.changed).toBe(true);
    const frames = result.nodes[0]?.data.frames as StoryboardFrameItem[];
    expect(frames.map((item) => [item.id, item.order])).toEqual([
      ['last', 0],
      ['first', 1],
      ['middle', 2],
    ]);
  });

  it('does not reorder unknown or identical frame targets', () => {
    const source = storyboardNode([frame('first', 0), frame('second', 1)]);
    const nodes = [source];

    expect(
      reorderStoryboardFrameInGraph(nodes, source.id, 'first', 'first'),
    ).toEqual({ nodes, changed: false });
    expect(
      reorderStoryboardFrameInGraph(nodes, source.id, 'first', 'missing'),
    ).toEqual({ nodes, changed: false });
  });
});
