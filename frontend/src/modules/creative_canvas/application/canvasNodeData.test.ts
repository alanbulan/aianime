// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cloneCanvasNodeData,
  updateCanvasNodeData,
  type CanvasNodeDataUpdatePorts,
} from './canvasNodeData';

interface TestNodeData {
  content: string;
  count: number;
}

interface TestNode {
  id: string;
  data: TestNodeData;
  layoutVersion: number;
}

const updatePorts: CanvasNodeDataUpdatePorts<TestNode, TestNodeData> = {
  applyMergedNodeData: (node, data) => ({
    ...node,
    data,
    layoutVersion: node.layoutVersion + 1,
  }),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function node(overrides: Partial<TestNode> = {}): TestNode {
  return {
    id: 'node',
    data: { content: 'before', count: Number.NaN },
    layoutVersion: 0,
    ...overrides,
  };
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

  it('merges a changed patch through the layout port and preserves other nodes', () => {
    const target = node();
    const other = node({ id: 'other' });
    const result = updateCanvasNodeData(
      [target, other],
      target.id,
      { content: 'after' },
      updatePorts,
    );

    expect(result.changed).toBe(true);
    expect(result.nodes[0]).not.toBe(target);
    expect(result.nodes[0]).toEqual({
      id: 'node',
      data: { content: 'after', count: Number.NaN },
      layoutVersion: 1,
    });
    expect(result.nodes[1]).toBe(other);
  });

  it('uses Object.is and returns the original graph for equal or missing patches', () => {
    const target = node();
    const nodes = [target];

    expect(updateCanvasNodeData(
      nodes,
      target.id,
      { count: Number.NaN },
      updatePorts,
    )).toEqual({ nodes, changed: false });
    expect(updateCanvasNodeData(
      nodes,
      'missing',
      { content: 'after' },
      updatePorts,
    )).toEqual({ nodes, changed: false });
  });
});
