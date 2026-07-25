// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import { createCanvasClipboardSnapshot } from './createCanvasClipboardSnapshot';

function node(id: string, selected = true): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.textAnnotation,
    position: { x: 10, y: 20 },
    selected,
    dragging: true,
    data: {
      content: id,
      nested: { value: 1 },
    },
  } as CanvasNode;
}

describe('createCanvasClipboardSnapshot', () => {
  it('deep-clones selected nodes and keeps only internal edges', () => {
    const selectedNode = node('node-1');
    const secondSelectedNode = node('node-2');
    const nodes = [selectedNode, secondSelectedNode, node('node-3', false)];
    const edges = [
      { id: 'internal', source: 'node-1', target: 'node-2' },
      { id: 'external', source: 'node-1', target: 'node-3' },
    ] as CanvasEdge[];

    const snapshot = createCanvasClipboardSnapshot({
      nodes,
      edges,
      selectedNodeIds: ['node-1', 'node-2'],
      sourceProject: 'project-1',
    });

    expect(snapshot).toEqual({
      nodes: [
        { ...selectedNode, selected: false, dragging: false },
        { ...secondSelectedNode, selected: false, dragging: false },
      ],
      edges: [{ id: 'internal', source: 'node-1', target: 'node-2' }],
      sourceProject: 'project-1',
    });
    expect(snapshot?.nodes[0].data).not.toBe(selectedNode.data);
    expect((snapshot?.nodes[0].data as { nested: object }).nested).not.toBe(
      (selectedNode.data as { nested: object }).nested,
    );
    expect(snapshot?.edges[0]).not.toBe(edges[0]);
  });

  it('returns null when none of the requested nodes exist', () => {
    expect(createCanvasClipboardSnapshot({
      nodes: [node('node-1')],
      edges: [],
      selectedNodeIds: ['missing'],
      sourceProject: null,
    })).toBeNull();
  });
});
