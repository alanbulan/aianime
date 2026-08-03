// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { createCanvasClipboardSnapshot } from './createCanvasClipboardSnapshot';

interface TestNode {
  id: string;
  selected: boolean;
  dragging: boolean;
  data: { content: string; nested: { value: number } };
}

interface TestEdge {
  id: string;
  source: string;
  target: string;
}

function node(id: string, selected = true): TestNode {
  return {
    id,
    selected,
    dragging: true,
    data: {
      content: id,
      nested: { value: 1 },
    },
  };
}

const cloneNode = (
  source: TestNode,
  state: { selected: false; dragging: false },
): TestNode => ({
  ...source,
  ...state,
  data: structuredClone(source.data),
});

describe('createCanvasClipboardSnapshot', () => {
  it('deep-clones selected nodes and keeps only internal edges', () => {
    const selectedNode = node('node-1');
    const secondSelectedNode = node('node-2');
    const nodes = [selectedNode, secondSelectedNode, node('node-3', false)];
    const edges: TestEdge[] = [
      { id: 'internal', source: 'node-1', target: 'node-2' },
      { id: 'external', source: 'node-1', target: 'node-3' },
    ];

    const snapshot = createCanvasClipboardSnapshot({
      nodes,
      edges,
      selectedNodeIds: ['node-1', 'node-2'],
      sourceProject: 'project-1',
      cloneNode,
      cloneEdge: (edge) => ({ ...edge }),
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
    expect(snapshot?.nodes[0].data.nested).not.toBe(selectedNode.data.nested);
    expect(snapshot?.edges[0]).not.toBe(edges[0]);
  });

  it('returns null when none of the requested nodes exist', () => {
    expect(
      createCanvasClipboardSnapshot({
        nodes: [node('node-1')],
        edges: [] as TestEdge[],
        selectedNodeIds: ['missing'],
        sourceProject: null,
        cloneNode,
        cloneEdge: (edge) => ({ ...edge }),
      }),
    ).toBeNull();
  });
});
