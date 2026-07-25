// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from './canvasNodes';
import { findLinkedCapturePartnerIds } from './canvasCapturePartners';

function node(
  id: string,
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  } as CanvasNode;
}

function captureGraph(): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const source = node('source');
  const group = node('group', { type: CANVAS_NODE_TYPES.group });
  const capture = node('capture', {
    parentId: group.id,
    data: { captureMetadata: { yaw: 90 } },
  });
  return {
    nodes: [source, group, capture],
    edges: [{ id: 'capture-edge', source: source.id, target: capture.id }],
  };
}

describe('Canvas capture partners', () => {
  it('resolves the output group when dragging its source', () => {
    const graph = captureGraph();

    expect(
      findLinkedCapturePartnerIds('source', graph.nodes, graph.edges),
    ).toEqual(['group']);
  });

  it('resolves each top-level source when dragging the output group', () => {
    const graph = captureGraph();
    const secondSource = node('second-source');
    graph.nodes.push(secondSource);
    graph.edges.push({
      id: 'second-edge',
      source: secondSource.id,
      target: 'capture',
    });

    expect(
      findLinkedCapturePartnerIds('group', graph.nodes, graph.edges),
    ).toEqual(['source', 'second-source']);
  });

  it('rejects missing and nested dragged nodes', () => {
    const graph = captureGraph();
    const outer = node('outer', { type: CANVAS_NODE_TYPES.group });
    graph.nodes.push(outer, node('nested-source', { parentId: outer.id }));
    graph.edges.push({
      id: 'nested-edge',
      source: 'nested-source',
      target: 'capture',
    });

    expect(
      findLinkedCapturePartnerIds('missing', graph.nodes, graph.edges),
    ).toEqual([]);
    expect(
      findLinkedCapturePartnerIds('nested-source', graph.nodes, graph.edges),
    ).toEqual([]);
    expect(
      findLinkedCapturePartnerIds('group', graph.nodes, graph.edges),
    ).toEqual(['source']);
  });

  it('ignores ordinary children and nested output groups', () => {
    const source = node('source');
    const outer = node('outer', { type: CANVAS_NODE_TYPES.group });
    const nestedGroup = node('nested-group', {
      type: CANVAS_NODE_TYPES.group,
      parentId: outer.id,
    });
    const ordinary = node('ordinary', { parentId: nestedGroup.id });
    const capture = node('capture', {
      parentId: nestedGroup.id,
      data: { captureMetadata: true },
    });
    const edges: CanvasEdge[] = [
      { id: 'ordinary-edge', source: source.id, target: ordinary.id },
      { id: 'capture-edge', source: source.id, target: capture.id },
    ];

    expect(
      findLinkedCapturePartnerIds(
        source.id,
        [source, outer, nestedGroup, ordinary, capture],
        edges,
      ),
    ).toEqual([]);
  });
});
