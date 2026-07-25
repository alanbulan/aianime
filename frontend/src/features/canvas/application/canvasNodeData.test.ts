// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CANVAS_NODE_TYPES, type CanvasNode } from '../domain/canvasNodes';
import { cloneCanvasNodeData, updateCanvasNodeData } from './canvasNodeData';

afterEach(() => {
  vi.unstubAllGlobals();
});

function node(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: 'node',
    type: CANVAS_NODE_TYPES.textAnnotation,
    position: { x: 0, y: 0 },
    data: { content: 'before', count: Number.NaN },
    ...overrides,
  } as CanvasNode;
}

describe('Canvas node data updates', () => {
  it('deep-clones node data with the runtime clone implementation', () => {
    const source = { content: 'text', nested: { values: [1, 2] } };
    const cloned = cloneCanvasNodeData(source);

    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
    expect(cloned.nested).not.toBe(source.nested);
    expect(cloned.nested.values).not.toBe(source.nested.values);
  });

  it('falls back to JSON cloning when structuredClone is unavailable', () => {
    vi.stubGlobal('structuredClone', undefined);
    const source = { content: 'text', nested: { value: 1 } };

    expect(cloneCanvasNodeData(source)).toEqual(source);
    expect(cloneCanvasNodeData(source).nested).not.toBe(source.nested);
  });

  it('merges a changed patch and preserves unrelated nodes', () => {
    const target = node();
    const other = node({ id: 'other' });
    const result = updateCanvasNodeData(
      [target, other],
      target.id,
      { content: 'after' },
    );

    expect(result.changed).toBe(true);
    expect(result.nodes[0]).not.toBe(target);
    expect(result.nodes[0]?.data).toMatchObject({
      content: 'after',
      count: Number.NaN,
    });
    expect(result.nodes[1]).toBe(other);
  });

  it('uses Object.is and returns the original graph for equal or missing patches', () => {
    const target = node();
    const nodes = [target];

    expect(updateCanvasNodeData(nodes, target.id, { count: Number.NaN })).toEqual({
      nodes,
      changed: false,
    });
    expect(updateCanvasNodeData(nodes, 'missing', { content: 'after' })).toEqual({
      nodes,
      changed: false,
    });
  });

  it('applies the existing image auto-resize rule after merging data', () => {
    const image = node({
      type: CANVAS_NODE_TYPES.exportImage,
      width: 300,
      height: 300,
      style: { width: 300, height: 300 },
      data: { imageUrl: null, aspectRatio: '1:1' },
    });
    const result = updateCanvasNodeData([image], image.id, {
      imageUrl: '/wide.png',
      aspectRatio: '2:1',
    });

    expect(result.changed).toBe(true);
    expect(result.nodes[0]).toMatchObject({
      width: 600,
      height: 300,
      style: { width: 600, height: 300 },
      data: { imageUrl: '/wide.png', aspectRatio: '2:1' },
    });
  });
});
