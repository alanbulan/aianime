// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '@/features/canvas/domain/canvasNodes';
import { useCanvasStore } from '@/stores/canvasStore';

function node(id: string, type: CanvasNode['type']): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as CanvasNode;
}

describe('canvasStore edge creation', () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
  });

  it('adds a basic edge without history and deduplicates repeated calls', () => {
    const source = node('source', CANVAS_NODE_TYPES.upload);
    const target = node('target', CANVAS_NODE_TYPES.imageGen);
    useCanvasStore.getState().setCanvasData([source, target], []);

    const edgeId = useCanvasStore.getState().addEdge(source.id, target.id);
    const created = useCanvasStore.getState();

    expect(edgeId).toBe('e-source-target');
    expect(created.edges).toHaveLength(1);
    expect(created.history.past).toHaveLength(0);
    expect(created.userEditsSinceHydrate).toBe(1);
    expect(created.addEdge(source.id, target.id)).toBe(edgeId);
    expect(useCanvasStore.getState().edges).toHaveLength(1);
    expect(useCanvasStore.getState().userEditsSinceHydrate).toBe(1);
  });

  it('rejects a basic edge with a missing endpoint', () => {
    const source = node('source', CANVAS_NODE_TYPES.upload);
    useCanvasStore.getState().setCanvasData([source], []);

    expect(useCanvasStore.getState().addEdge(source.id, 'missing')).toBeNull();
    expect(useCanvasStore.getState().edges).toEqual([]);
    expect(useCanvasStore.getState().userEditsSinceHydrate).toBe(0);
  });

  it('adds a data edge as one undoable transaction', () => {
    const source = node('source', CANVAS_NODE_TYPES.upload);
    const target = node('target', CANVAS_NODE_TYPES.imageGen);
    useCanvasStore.getState().setCanvasData([source, target], []);

    const edgeId = useCanvasStore.getState().addEdgeWithData(
      source.id,
      target.id,
      { edgeKind: 'annotation' },
    );
    const created = useCanvasStore.getState();

    expect(edgeId).toBe('e-source-target-annotation');
    expect(created.edges).toHaveLength(1);
    expect(created.history.past).toHaveLength(1);
    expect(created.lastMutationSource).toBe('user_edit');
    expect(created.undo()).toBe(true);
    expect(useCanvasStore.getState().edges).toEqual([]);
  });
});
