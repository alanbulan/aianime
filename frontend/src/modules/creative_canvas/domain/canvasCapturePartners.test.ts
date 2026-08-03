// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  findLinkedCapturePartnerIds,
  type CanvasCapturePartnerEdge,
  type CanvasCapturePartnerNode,
} from './canvasCapturePartners';

type TestNodeType = 'upload' | 'group';
type TestNode = CanvasCapturePartnerNode<TestNodeType>;

function node(
  id: string,
  overrides: Partial<TestNode> = {},
): TestNode {
  return {
    id,
    type: 'upload',
    data: {},
    ...overrides,
  };
}

function captureGraph(): {
  nodes: TestNode[];
  edges: CanvasCapturePartnerEdge[];
} {
  const source = node('source');
  const group = node('group', { type: 'group' });
  const capture = node('capture', {
    parentId: group.id,
    data: { captureMetadata: { yaw: 90 } },
  });
  return {
    nodes: [source, group, capture],
    edges: [{ source: source.id, target: capture.id }],
  };
}

function partners(
  draggedId: string,
  graph: ReturnType<typeof captureGraph>,
): string[] {
  return findLinkedCapturePartnerIds(
    draggedId,
    graph.nodes,
    graph.edges,
    'group',
  );
}

describe('Canvas capture partners', () => {
  it('resolves the output group when dragging its source', () => {
    const graph = captureGraph();

    expect(partners('source', graph)).toEqual(['group']);
  });

  it('resolves each top-level source when dragging the output group', () => {
    const graph = captureGraph();
    const secondSource = node('second-source');
    graph.nodes.push(secondSource);
    graph.edges.push({ source: secondSource.id, target: 'capture' });

    expect(partners('group', graph)).toEqual(['source', 'second-source']);
  });

  it('rejects missing and nested dragged nodes', () => {
    const graph = captureGraph();
    const outer = node('outer', { type: 'group' });
    graph.nodes.push(outer, node('nested-source', { parentId: outer.id }));
    graph.edges.push({ source: 'nested-source', target: 'capture' });

    expect(partners('missing', graph)).toEqual([]);
    expect(partners('nested-source', graph)).toEqual([]);
    expect(partners('group', graph)).toEqual(['source']);
  });

  it('ignores ordinary children and nested output groups', () => {
    const source = node('source');
    const outer = node('outer', { type: 'group' });
    const nestedGroup = node('nested-group', {
      type: 'group',
      parentId: outer.id,
    });
    const ordinary = node('ordinary', { parentId: nestedGroup.id });
    const capture = node('capture', {
      parentId: nestedGroup.id,
      data: { captureMetadata: true },
    });
    const graph = {
      nodes: [source, outer, nestedGroup, ordinary, capture],
      edges: [
        { source: source.id, target: ordinary.id },
        { source: source.id, target: capture.id },
      ],
    };

    expect(partners(source.id, graph)).toEqual([]);
  });
});
