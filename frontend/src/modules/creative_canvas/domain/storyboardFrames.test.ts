// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  reorderStoryboardFrameInGraph,
  updateStoryboardFrameInGraph,
  type StoryboardFrameGraphPorts,
} from './storyboardFrames';

interface TestFrame {
  id: string;
  imageUrl: string;
  note: string;
  order: number;
  previewImageUrl?: string;
}

interface TestNode {
  id: string;
  kind: 'storyboard' | 'other';
  data: { frames: TestFrame[] };
}

const ports: StoryboardFrameGraphPorts<TestNode, TestFrame> = {
  projectNode(node) {
    if (node.kind !== 'storyboard') {
      return null;
    }
    return {
      frames: node.data.frames,
      replaceFrames: (frames) => ({
        ...node,
        data: { ...node.data, frames },
      }),
    };
  },
};

function frame(id: string, order: number): TestFrame {
  return {
    id,
    imageUrl: `${id}.png`,
    note: `${id}-note`,
    order,
  };
}

function storyboardNode(frames: TestFrame[]): TestNode {
  return {
    id: 'storyboard',
    kind: 'storyboard',
    data: { frames },
  };
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
      ports,
    );

    expect(result.changed).toBe(true);
    expect(result.nodes[0]).not.toBe(source);
    const nextFrames = result.nodes[0]?.data.frames ?? [];
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
      updateStoryboardFrameInGraph(
        nodes,
        source.id,
        'first',
        { note: 'first-note' },
        ports,
      ),
    ).toEqual({ nodes, changed: false });
    expect(
      updateStoryboardFrameInGraph(
        nodes,
        source.id,
        'missing',
        { note: 'updated' },
        ports,
      ),
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
      ports,
    );

    expect(result.changed).toBe(true);
    const frames = result.nodes[0]?.data.frames ?? [];
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
      reorderStoryboardFrameInGraph(
        nodes,
        source.id,
        'first',
        'first',
        ports,
      ),
    ).toEqual({ nodes, changed: false });
    expect(
      reorderStoryboardFrameInGraph(
        nodes,
        source.id,
        'first',
        'missing',
        ports,
      ),
    ).toEqual({ nodes, changed: false });
  });
});
