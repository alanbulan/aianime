// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { CANVAS_NODE_TYPES, type CanvasNode } from './canvasNodes';
import {
  findAvailableNodePosition,
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

  it('uses the empty fallback when placement source is missing', () => {
    expect(
      findAvailableNodePosition({
        nodes: [],
        sourceNodeId: 'missing',
        newNodeWidth: 50,
        newNodeHeight: 50,
        viewport: { x: 0, y: 0, zoom: 1 },
        viewportSize: { width: 0, height: 0 },
      }),
    ).toEqual({ x: 100, y: 100 });
  });

  it('places from React Flow measurements without applying group-size fallbacks', () => {
    const measuredSource = node('source', { x: 0, y: 0 }, {
      width: 50,
      height: 50,
      measured: { width: 100, height: 80 },
    });
    const unmeasuredSource = node('unmeasured', { x: 0, y: 0 }, {
      width: 50,
      height: 50,
    });
    const common = {
      newNodeWidth: 50,
      newNodeHeight: 50,
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { width: 0, height: 0 },
    };

    expect(
      findAvailableNodePosition({
        ...common,
        nodes: [measuredSource],
        sourceNodeId: measuredSource.id,
      }),
    ).toEqual({ x: 128, y: 0 });
    expect(
      findAvailableNodePosition({
        ...common,
        nodes: [unmeasuredSource],
        sourceNodeId: unmeasuredSource.id,
      }),
    ).toEqual({ x: 348, y: 0 });
  });

  it('skips a colliding right-hand slot using the existing candidate order', () => {
    const source = node('source', { x: 0, y: 0 }, {
      measured: { width: 100, height: 100 },
    });
    const obstacle = node('obstacle', { x: 128, y: 0 }, {
      measured: { width: 50, height: 50 },
    });

    expect(
      findAvailableNodePosition({
        nodes: [source, obstacle],
        sourceNodeId: source.id,
        newNodeWidth: 50,
        newNodeHeight: 50,
        viewport: { x: 0, y: 0, zoom: 1 },
        viewportSize: { width: 0, height: 0 },
      }),
    ).toEqual({ x: 128, y: 108 });
  });

  it('prefers a visible slot over the closer off-screen anchor', () => {
    const source = node('source', { x: 300, y: 0 }, {
      measured: { width: 80, height: 80 },
    });

    expect(
      findAvailableNodePosition({
        nodes: [source],
        sourceNodeId: source.id,
        newNodeWidth: 80,
        newNodeHeight: 80,
        viewport: { x: 0, y: 0, zoom: 1 },
        viewportSize: { width: 400, height: 300 },
      }),
    ).toEqual({ x: 300, y: 100 });
  });
});
