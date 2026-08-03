// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '@/features/canvas/domain/canvasNodes';
import {
  NODE_TOOL_TYPES,
  type StoryboardFrameItem,
} from '@/modules/creative_canvas/public';
import { useCanvasStore } from '@/features/canvas/canvasStore';

function sourceNode(): CanvasNode {
  return {
    id: 'source',
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: { imageUrl: '/source.png', aspectRatio: '16:9' },
  } as CanvasNode;
}

function prepareSource(): CanvasNode {
  const source = sourceNode();
  const store = useCanvasStore.getState();
  store.setCanvasData([source], []);
  store.openToolDialog({ nodeId: source.id, toolType: NODE_TOOL_TYPES.crop });
  return source;
}

function expectCommitted(createdId: string | null): void {
  expect(createdId).toBeTruthy();
  const created = useCanvasStore.getState();
  expect(created.nodes.map((node) => node.id)).toEqual(['source', createdId]);
  expect(created.selectedNodeId).toBe(createdId);
  expect(created.activeToolDialog).toBeNull();
  expect(created.history.past).toHaveLength(1);
  expect(created.lastMutationSource).toBe('user_edit');
  expect(created.undo()).toBe(true);
  expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['source']);
}

describe('canvasStore derived node creation', () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
  });

  it('commits a derived upload as one transaction', () => {
    const source = prepareSource();
    const createdId = useCanvasStore.getState().addDerivedUploadNode(
      source.id,
      '/upload.png',
      '1:1',
    );

    expectCommitted(createdId);
  });

  it('commits a derived export as one transaction', () => {
    const source = prepareSource();
    const createdId = useCanvasStore.getState().addDerivedExportNode(
      source.id,
      '/export.png',
      '1:1',
      undefined,
      { resultKind: 'generic' },
    );

    expectCommitted(createdId);
  });

  it('commits a storyboard split as one transaction', () => {
    const source = prepareSource();
    const frames: StoryboardFrameItem[] = [
      { id: 'frame', imageUrl: '/frame.png', note: '', order: 0 },
    ];
    const createdId = useCanvasStore.getState().addStoryboardSplitNode(
      source.id,
      1,
      1,
      frames,
    );

    expectCommitted(createdId);
  });
});
