// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { CANVAS_NODE_TYPES, type CanvasNode } from './canvasNodes';
import {
  canvasNodeIntersectsSelectionRect,
  canvasViewportOverlapsRect,
  findAvailableNodePosition,
  getDerivedNodePosition,
  getNodeSize,
  getTopLevelCanvasBounds,
  hasVisibleTopLevelCanvasNode,
  hasRectCollision,
  rectsIntersect,
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
  it('prefers measured, explicit and legacy style sizes before the node-type fallback', () => {
    const video = node('video', undefined, {
      type: CANVAS_NODE_TYPES.video,
    });
    expect(getNodeSize(video)).toEqual({ width: 580, height: 380 });
    expect(getNodeSize({
      ...video,
      style: { width: 720, height: 405 },
    })).toEqual({ width: 720, height: 405 });
    expect(getNodeSize({
      ...video,
      width: 640,
      height: 360,
      style: { width: 720, height: 405 },
    })).toEqual({
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

  it('detects node collisions with spacing and supports ignored nodes', () => {
    const obstacle = node('obstacle', { x: 100, y: 100 }, {
      style: { width: 80, height: 60 },
    });
    const candidate = { x: 0, y: 0, width: 90, height: 90 };

    expect(hasRectCollision(candidate, [obstacle], new Set())).toBe(true);
    expect(hasRectCollision(candidate, [obstacle], new Set([obstacle.id]))).toBe(false);
    expect(
      hasRectCollision({ x: 0, y: 0, width: 80, height: 80 }, [obstacle], new Set()),
    ).toBe(false);
  });

  it('treats positive rectangle overlap as intersection but not edge contact', () => {
    const anchor = { x: 10, y: 10, width: 50, height: 40 };

    expect(rectsIntersect(anchor, { x: 59, y: 20, width: 20, height: 20 })).toBe(true);
    expect(rectsIntersect(anchor, { x: 60, y: 20, width: 20, height: 20 })).toBe(false);
    expect(rectsIntersect(anchor, { x: 20, y: 50, width: 20, height: 20 })).toBe(false);
  });

  it('projects nested Canvas node geometry for marquee hit testing', () => {
    const group = node('group', { x: 100, y: 100 }, {
      measured: { width: 240, height: 180 },
    });
    const child = node('child', { x: 30, y: 40 }, {
      parentId: group.id,
      measured: { width: 80, height: 60 },
    });
    const nodeMap = new Map([
      [group.id, group],
      [child.id, child],
    ]);

    expect(
      canvasNodeIntersectsSelectionRect(
        child,
        { x: 120, y: 130, width: 100, height: 90 },
        nodeMap,
      ),
    ).toBe(true);
    expect(
      canvasNodeIntersectsSelectionRect(
        child,
        { x: 300, y: 300, width: 20, height: 20 },
        nodeMap,
      ),
    ).toBe(false);
  });

  it('builds top-level canvas bounds and ignores parent-relative children', () => {
    const root = node('root', { x: 10, y: 20 }, {
      measured: { width: 100, height: 50 },
    });
    const right = node('right', { x: 200, y: 100 }, {
      width: 40,
      height: 60,
    });
    const child = node('child', { x: 1000, y: 1000 }, {
      parentId: root.id,
      measured: { width: 500, height: 500 },
    });

    expect(getTopLevelCanvasBounds([root, right, child])).toEqual({
      x: 10,
      y: 20,
      width: 230,
      height: 140,
    });
    expect(getTopLevelCanvasBounds([child])).toBeNull();
  });

  it('detects whether a viewport overlaps a canvas rectangle', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const viewportSize = { width: 100, height: 100 };

    expect(
      canvasViewportOverlapsRect({ x: 0, y: 0, zoom: 1 }, viewportSize, bounds),
    ).toBe(true);
    expect(
      canvasViewportOverlapsRect({ x: -100, y: 0, zoom: 1 }, viewportSize, bounds),
    ).toBe(false);
    expect(
      canvasViewportOverlapsRect({ x: -100, y: 0, zoom: 2 }, viewportSize, bounds),
    ).toBe(true);
  });

  it('requires a real top-level node in view rather than only its aggregate bounds', () => {
    const left = node('left', { x: 0, y: 0 }, {
      measured: { width: 100, height: 100 },
    });
    const right = node('right', { x: 300, y: 0 }, {
      measured: { width: 100, height: 100 },
    });
    const child = node('child', { x: 160, y: 0 }, {
      parentId: left.id,
      measured: { width: 40, height: 40 },
    });

    expect(
      hasVisibleTopLevelCanvasNode(
        [left, right, child],
        { x: -150, y: 0, zoom: 1 },
        { width: 100, height: 100 },
      ),
    ).toBe(false);
    expect(
      hasVisibleTopLevelCanvasNode(
        [left, right, child],
        { x: -250, y: 0, zoom: 1 },
        { width: 100, height: 100 },
      ),
    ).toBe(true);
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
