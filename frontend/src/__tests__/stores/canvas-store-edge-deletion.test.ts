// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from 'vitest';

import { type CanvasEdge, type CanvasNode } from '@/features/canvas/domain/canvasNodes';
import { useCanvasStore } from '@/features/canvas/canvasStore';

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
function node(id: string): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: {},
  } as CanvasNode;
}

function graph(edgeData?: Record<string, unknown>): {
  nodes: CanvasNode[];
  edge: CanvasEdge;
} {
  const source = node('source');
  const target = {
    ...node('target'),
    type: CANVAS_NODE_TYPES.imageGen,
  } as CanvasNode;
  return {
    nodes: [source, target],
    edge: {
      id: 'edge',
      source: source.id,
      target: target.id,
      sourceHandle: 'source',
      targetHandle: 'target',
      type: 'disconnectableEdge',
      data: edgeData,
    },
  };
}

describe('canvasStore edge deletion', () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
  });

  it('commits an ordinary edge deletion as one undoable transaction', () => {
    const seeded = graph();
    useCanvasStore.getState().setCanvasData(seeded.nodes, [seeded.edge]);

    useCanvasStore.getState().deleteEdge(seeded.edge.id);

    const deleted = useCanvasStore.getState();
    expect(deleted.edges).toEqual([]);
    expect(deleted.history.past).toHaveLength(1);
    expect(deleted.lastMutationSource).toBe('user_edit');
    expect(deleted.undo()).toBe(true);
    expect(useCanvasStore.getState().edges).toEqual([seeded.edge]);
  });

  it('leaves missing and backend-managed edges unchanged', () => {
    const seeded = graph({ preset_managed: true });
    useCanvasStore.getState().setCanvasData(seeded.nodes, [seeded.edge]);
    const before = useCanvasStore.getState();

    before.deleteEdge('missing');
    useCanvasStore.getState().deleteEdge(seeded.edge.id);

    const after = useCanvasStore.getState();
    expect(after.edges).toEqual([seeded.edge]);
    expect(after.history).toEqual(before.history);
    expect(after.userEditsSinceHydrate).toBe(before.userEditsSinceHydrate);
  });
});
