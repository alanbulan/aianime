// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import type { NodeFactory } from './ports';
import {
  duplicateCanvasNodeAsSibling,
  duplicateCanvasNodesAsSiblings,
} from './canvasNodeDuplication';

function node(
  id: string,
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.textAnnotation,
    position: { x: 10, y: 20 },
    measured: { width: 320, height: 100 },
    data: { content: id },
    ...overrides,
  } as CanvasNode;
}

function factory(...ids: string[]): NodeFactory {
  let index = 0;
  return {
    createNode: (type, position, data = {}) => ({
      id: ids[index++] ?? `clone-${index}`,
      type,
      position,
      data,
    }) as CanvasNode,
  };
}

describe('Canvas node duplication', () => {
  it('duplicates one sibling with indexed offset, overrides, and mirrored incoming edges', () => {
    const source = node('source');
    const upstream = node('upstream');
    const edges: CanvasEdge[] = [
      {
        id: 'incoming',
        source: upstream.id,
        target: source.id,
      },
      {
        id: 'outgoing',
        source: source.id,
        target: upstream.id,
      },
    ];
    const result = duplicateCanvasNodeAsSibling(
      [source, upstream],
      edges,
      source.id,
      2,
      { content: 'override' },
      factory('clone'),
    );

    expect(result?.createdIds).toEqual(['clone']);
    expect(result?.nodes[2]).toMatchObject({
      id: 'clone',
      position: { x: 10, y: 268 },
      data: { content: 'override' },
    });
    expect(result?.edges.slice(2)).toEqual([
      {
        id: 'e-upstream-clone',
        source: 'upstream',
        target: 'clone',
        sourceHandle: 'source',
        targetHandle: 'target',
        type: 'disconnectableEdge',
      },
    ]);
  });

  it('returns null when the single source is missing', () => {
    expect(
      duplicateCanvasNodeAsSibling([], [], 'missing', 1, {}, factory('clone')),
    ).toBeNull();
  });

  it('duplicates a selected subgraph with names, parents, and internal rewiring', () => {
    const external = node('external');
    const first = node('first', {
      selected: true,
      parentId: 'group',
      extent: 'parent',
      data: { displayName: 'First', label: 'Label' },
    });
    const second = node('second', {
      selected: true,
      position: { x: 400, y: 20 },
      height: 200,
      measured: undefined,
      data: { displayName: 'Second' },
    });
    const edges: CanvasEdge[] = [
      { id: 'external-first', source: external.id, target: first.id },
      { id: 'first-second', source: first.id, target: second.id },
    ];
    const result = duplicateCanvasNodesAsSiblings(
      [external, first, second],
      edges,
      [first.id, second.id],
      factory('first-copy', 'second-copy'),
    );

    expect(result.createdIds).toEqual(['first-copy', 'second-copy']);
    expect(result.nodes.slice(0, 3).map((item) => item.selected)).toEqual([
      undefined,
      false,
      false,
    ]);
    expect(result.nodes[3]).toMatchObject({
      id: 'first-copy',
      selected: true,
      parentId: 'group',
      extent: 'parent',
      position: { x: 10, y: 144 },
      data: {
        displayName: 'First - 副本',
        label: 'Label - 副本',
      },
    });
    expect(result.nodes[4]).toMatchObject({
      id: 'second-copy',
      selected: true,
      position: { x: 400, y: 244 },
      data: { displayName: 'Second - 副本' },
    });
    expect(result.edges.slice(2)).toEqual([
      expect.objectContaining({
        id: 'e-external-first-copy',
        source: 'external',
        target: 'first-copy',
      }),
      expect.objectContaining({
        id: 'e-first-copy-second-copy',
        source: 'first-copy',
        target: 'second-copy',
      }),
    ]);
  });

  it('returns the original graph when no batch source exists', () => {
    const source = node('source');
    const nodes = [source];
    const edges: CanvasEdge[] = [];

    expect(
      duplicateCanvasNodesAsSiblings(nodes, edges, ['missing'], factory('copy')),
    ).toEqual({ nodes, edges, createdIds: [] });
  });
});
