// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  useCanvasStore,
  type CanvasEdge,
  type CanvasNode,
} from '@/modules/creative_canvas/public';
import {
  INITIAL_STYLE_NODE_SYNC_STATE,
  readStyleNodeSyncState,
  writeStyleNodeSyncState,
} from '@/modules/creative_canvas/application/styleNodeSync';

function node(
  id: string,
  type: CanvasNode['type'],
  data: Record<string, unknown> = {},
): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data } as CanvasNode;
}

function edge(source: string, target: string): CanvasEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    sourceHandle: 'source',
    targetHandle: 'target',
    type: 'disconnectableEdge',
  };
}

describe('canvasStore StyleNode wiring', () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
  });

  it('allows the synchronization path but rejects a manual StyleNode edge', () => {
    const style = node('style', CANVAS_NODE_TYPES.style, {
      styleTemplateId: 'golden_age',
    });
    const image = node('image', CANVAS_NODE_TYPES.imageGen, {
      styleTemplateId: 'golden_age',
    });
    useCanvasStore.getState().setCanvasData([style, image], []);

    useCanvasStore.getState().onConnect({
      source: style.id,
      target: image.id,
      sourceHandle: null,
      targetHandle: null,
    });
    expect(useCanvasStore.getState().edges).toEqual([]);

    expect(useCanvasStore.getState().addEdge(style.id, image.id)).toBe(
      'e-style-image',
    );
    expect(useCanvasStore.getState().edges).toEqual([
      expect.objectContaining({ source: style.id, target: image.id }),
    ]);
  });

  it('does not clone the original StyleNode edge with an image sibling', () => {
    useCanvasStore.getState().setCanvasData(
      [
        node('style', CANVAS_NODE_TYPES.style, {
          styleTemplateId: 'golden_age',
        }),
        node('upload', CANVAS_NODE_TYPES.upload, { imageUrl: '/input.png' }),
        node('image', CANVAS_NODE_TYPES.imageGen, {
          styleTemplateId: 'golden_age',
        }),
      ],
      [edge('style', 'image'), edge('upload', 'image')],
    );

    const [cloneId] = useCanvasStore
      .getState()
      .duplicateNodesAsSiblings(['image']);
    const cloneSources = useCanvasStore
      .getState()
      .edges
      .filter((item) => item.target === cloneId)
      .map((item) => item.source);

    expect(cloneSources).toEqual(['upload']);
  });

  it('clears synchronization bookkeeping when a canvas document is replaced', () => {
    writeStyleNodeSyncState('image', {
      lastSyncedTemplateId: 'golden_age',
      everObservedStyleNode: true,
    });

    useCanvasStore.getState().setCanvasData([], []);

    expect(readStyleNodeSyncState('image')).toEqual(
      INITIAL_STYLE_NODE_SYNC_STATE,
    );
  });
});
