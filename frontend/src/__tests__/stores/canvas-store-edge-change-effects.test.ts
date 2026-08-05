// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from 'vitest';

import { type CanvasEdge, type CanvasNode } from '@/features/canvas/domain/canvasNodes';
import { useCanvasStore } from '@/features/canvas/canvasStore';

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
function seedGraph(): CanvasEdge {
  const source = {
    id: 'source',
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: {},
  } as CanvasNode;
  const target = {
    id: 'target',
    type: CANVAS_NODE_TYPES.imageGen,
    position: { x: 400, y: 0 },
    data: {},
  } as CanvasNode;
  const edge: CanvasEdge = {
    id: 'edge',
    source: source.id,
    target: target.id,
    sourceHandle: 'source',
    targetHandle: 'target',
    type: 'disconnectableEdge',
  };
  useCanvasStore.getState().setCanvasData([source, target], [edge]);
  return edge;
}

describe('canvasStore edge change effects', () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
  });

  it('applies edge selection without recording an edit', () => {
    const edge = seedGraph();

    useCanvasStore.getState().onEdgesChange([
      { id: edge.id, type: 'select', selected: true },
    ]);

    const selected = useCanvasStore.getState();
    expect(selected.edges[0]?.selected).toBe(true);
    expect(selected.history.past).toHaveLength(0);
    expect(selected.userEditsSinceHydrate).toBe(0);
  });

  it('records edge removal as one undoable edit', () => {
    const edge = seedGraph();

    useCanvasStore.getState().onEdgesChange([
      { id: edge.id, type: 'remove' },
    ]);

    const removed = useCanvasStore.getState();
    expect(removed.edges).toEqual([]);
    expect(removed.history.past).toHaveLength(1);
    expect(removed.userEditsSinceHydrate).toBe(1);
    expect(removed.undo()).toBe(true);
    expect(useCanvasStore.getState().edges).toEqual([edge]);
  });
});
