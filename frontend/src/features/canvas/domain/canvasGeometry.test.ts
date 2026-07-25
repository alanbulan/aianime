// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { CANVAS_NODE_TYPES, type CanvasNode } from './canvasNodes';
import {
  getDerivedNodePosition,
  getNodeSize,
  resolveAbsolutePosition,
} from './canvasGeometry';

function node(
  id: string,
  position: { x: number; y: number } = { x: 0, y: 0 },
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position,
    data: {},
    ...overrides,
  } as CanvasNode;
}

describe('Canvas geometry', () => {
  it('prefers measured size, then explicit size, then the node-type fallback', () => {
    const video = node('video', undefined, {
      type: CANVAS_NODE_TYPES.video,
    });
    expect(getNodeSize(video)).toEqual({ width: 580, height: 380 });
    expect(getNodeSize({ ...video, width: 640, height: 360 })).toEqual({
      width: 640,
      height: 360,
    });
    expect(
      getNodeSize({
        ...video,
        width: 640,
        height: 360,
        measured: { width: 800, height: 450 },
      }),
    ).toEqual({ width: 800, height: 450 });
  });

  it('accumulates nested parent positions without mutating the graph', () => {
    const root = node('root', { x: 100, y: 200 });
    const group = node('group', { x: 20, y: 30 }, { parentId: root.id });
    const child = node('child', { x: 4, y: 5 }, { parentId: group.id });
    const nodeMap = new Map([
      [root.id, root],
      [group.id, group],
      [child.id, child],
    ]);

    expect(resolveAbsolutePosition(child, nodeMap)).toEqual({ x: 124, y: 235 });
    expect(child.position).toEqual({ x: 4, y: 5 });
  });

  it('places a derived node to the right of its source or uses the empty fallback', () => {
    const source = node('source', { x: 10, y: 20 });

    expect(getDerivedNodePosition([source], source.id)).toEqual({ x: 430, y: 20 });
    expect(getDerivedNodePosition([], 'missing')).toEqual({ x: 100, y: 100 });
  });
});
