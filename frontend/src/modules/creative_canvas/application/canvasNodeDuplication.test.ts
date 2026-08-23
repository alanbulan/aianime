// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  duplicateCanvasNodeAsSibling,
  duplicateCanvasNodesAsSiblings,
  type DuplicationCreatedNode,
  type DuplicationGraphEdge,
  type DuplicationGraphNode,
  type DuplicationNodeFactory,
} from './canvasNodeDuplication';

function node(
  id: string,
  overrides: Partial<DuplicationGraphNode> = {},
): DuplicationGraphNode {
  return {
    id,
    type: 'textAnnotationNode',
    position: { x: 10, y: 20 },
    measured: { width: 320, height: 100 },
    data: { content: id },
    ...overrides,
  };
}

function factory(...ids: string[]): DuplicationNodeFactory {
  let index = 0;
  return {
    createNode: (type, position, data = {}) => ({
      id: ids[index++] ?? `clone-${index}`,
      type,
      position,
      data,
    }) as DuplicationCreatedNode,
  };
}

describe('Canvas node duplication', () => {
  it('duplicates one sibling with indexed offset, overrides, and mirrored incoming edges', () => {
    const source = node('source');
    const upstream = node('upstream');
    const edges: DuplicationGraphEdge[] = [
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
    const edges: DuplicationGraphEdge[] = [
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
    const edges: DuplicationGraphEdge[] = [];

    expect(
      duplicateCanvasNodesAsSiblings(nodes, edges, ['missing'], factory('copy')),
    ).toEqual({ nodes, edges, createdIds: [] });
  });

  it('does not clone an external StyleNode edge into an image sibling', () => {
    const style = node('style', { type: 'styleNode' });
    const upload = node('upload', { type: 'uploadNode' });
    const image = node('image', { type: 'imageGenNode' });
    const edges: DuplicationGraphEdge[] = [
      { id: 'style-image', source: style.id, target: image.id },
      { id: 'upload-image', source: upload.id, target: image.id },
    ];

    const result = duplicateCanvasNodeAsSibling(
      [style, upload, image],
      edges,
      image.id,
      1,
      {},
      factory('image-copy'),
    );

    expect(
      result?.edges
        .filter((edge) => edge.target === 'image-copy')
        .map((edge) => edge.source),
    ).toEqual(['upload']);
  });

  it('rewires a StyleNode edge when style and image are duplicated together', () => {
    const style = node('style', { type: 'styleNode' });
    const image = node('image', { type: 'imageGenNode' });
    const result = duplicateCanvasNodesAsSiblings(
      [style, image],
      [{ id: 'style-image', source: style.id, target: image.id }],
      [style.id, image.id],
      factory('style-copy', 'image-copy'),
    );

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        source: 'style-copy',
        target: 'image-copy',
      }),
    );
    expect(result.edges).not.toContainEqual(
      expect.objectContaining({ source: 'style', target: 'image-copy' }),
    );
  });
});
