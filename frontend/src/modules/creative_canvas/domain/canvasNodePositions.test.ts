// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  setCanvasNodePositions,
  updateCanvasNodePosition,
} from './canvasNodePositions';

interface TestNode {
  id: string;
  position: { x: number; y: number };
  kind: 'test';
}

function node(id: string, x: number, y: number): TestNode {
  return { id, position: { x, y }, kind: 'test' };
}

describe('Canvas node position rules', () => {
  it('updates one node without rounding the supplied position', () => {
    const first = node('first', 0, 0);
    const second = node('second', 10, 20);
    const position = { x: 12.25, y: 34.75 };
    const result = updateCanvasNodePosition(
      [first, second],
      second.id,
      position,
    );

    expect(result.changed).toBe(true);
    expect(result.nodes[0]).toBe(first);
    expect(result.nodes[1]?.position).toBe(position);
    expect(result.nodes[1]?.kind).toBe('test');
  });

  it('returns the original graph for an equal or missing single-node update', () => {
    const first = node('first', 10, 20);
    const nodes = [first];

    expect(updateCanvasNodePosition(nodes, first.id, { x: 10, y: 20 })).toEqual({
      nodes,
      changed: false,
    });
    expect(updateCanvasNodePosition(nodes, 'missing', { x: 1, y: 2 })).toEqual({
      nodes,
      changed: false,
    });
  });

  it('rounds batch positions and preserves nodes without a requested position', () => {
    const first = node('first', 0, 0);
    const second = node('second', 10, 20);
    const result = setCanvasNodePositions([first, second], {
      first: { x: 10.4, y: 20.6 },
    });

    expect(result.changed).toBe(true);
    expect(result.nodes[0]?.position).toEqual({ x: 10, y: 21 });
    expect(result.nodes[0]?.kind).toBe('test');
    expect(result.nodes[1]).toBe(second);
  });

  it('returns the original graph when rounded batch positions are unchanged', () => {
    const first = node('first', 10, 21);
    const nodes = [first];

    expect(
      setCanvasNodePositions(nodes, {
        first: { x: 10.4, y: 20.6 },
      }),
    ).toEqual({ nodes, changed: false });
  });
});
