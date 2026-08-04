// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  orderedReferenceUrlsWithOwnFirst,
  sortUpstreamByReferenceOrder,
  upstreamNodesInEdgeOrder,
} from './referenceOrdering';

type Node = { id: string; position?: { y?: number } };

const ids = (nodes: readonly Node[]) => nodes.map((node) => node.id);

describe('sortUpstreamByReferenceOrder', () => {
  it('keeps newly connected nodes in connection order', () => {
    const connectionOrder: Node[] = [
      { id: 'red', position: { y: 900 } },
      { id: 'grid', position: { y: 0 } },
    ];

    expect(ids(sortUpstreamByReferenceOrder(connectionOrder, undefined))).toEqual([
      'red',
      'grid',
    ]);
  });

  it('honors an explicit manual order', () => {
    const connectionOrder: Node[] = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ];

    expect(
      ids(sortUpstreamByReferenceOrder(connectionOrder, ['c', 'a', 'b'])),
    ).toEqual(['c', 'a', 'b']);
  });

  it('places manually ordered nodes first and preserves the remaining order', () => {
    const connectionOrder: Node[] = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
    ];

    expect(ids(sortUpstreamByReferenceOrder(connectionOrder, ['b']))).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
  });

  it('does not mutate the input', () => {
    const input: Node[] = [{ id: 'x' }, { id: 'y' }];

    sortUpstreamByReferenceOrder(input, undefined);

    expect(ids(input)).toEqual(['x', 'y']);
  });
});

describe('upstreamNodesInEdgeOrder', () => {
  it('uses edge order rather than node storage order', () => {
    const nodes: Node[] = [
      { id: 'gen' },
      { id: 'upload-a' },
      { id: 'upload-b' },
    ];
    const edges = [
      { source: 'upload-a', target: 'video' },
      { source: 'upload-b', target: 'video' },
      { source: 'gen', target: 'video' },
    ];

    expect(ids(upstreamNodesInEdgeOrder(nodes, edges, 'video'))).toEqual([
      'upload-a',
      'upload-b',
      'gen',
    ]);
  });

  it('ignores unrelated edges and missing source nodes', () => {
    const nodes: Node[] = [{ id: 'a' }, { id: 'b' }];
    const edges = [
      { source: 'a', target: 'video' },
      { source: 'b', target: 'other' },
      { source: 'ghost', target: 'video' },
    ];

    expect(ids(upstreamNodesInEdgeOrder(nodes, edges, 'video'))).toEqual(['a']);
  });
});

describe('orderedReferenceUrlsWithOwnFirst', () => {
  it('puts the node-owned reference first', () => {
    expect(
      orderedReferenceUrlsWithOwnFirst('own.png', ['a.png', 'b.png']),
    ).toEqual(['own.png', 'a.png', 'b.png']);
  });

  it('keeps upstream order without a node-owned reference', () => {
    expect(orderedReferenceUrlsWithOwnFirst(null, ['a.png', 'b.png'])).toEqual([
      'a.png',
      'b.png',
    ]);
  });

  it('deduplicates a node-owned reference from upstream inputs', () => {
    expect(
      orderedReferenceUrlsWithOwnFirst('a.png', ['a.png', 'b.png']),
    ).toEqual(['a.png', 'b.png']);
  });
});
