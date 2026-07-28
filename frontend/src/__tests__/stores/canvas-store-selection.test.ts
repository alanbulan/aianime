// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from 'vitest';

import { NODE_TOOL_TYPES } from '@/features/canvas/domain/canvasNodes';
import { useCanvasStore } from '@/features/canvas/canvasStore';

describe('canvasStore selection state', () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
  });

  it('updates node selection and the active tool dialog', () => {
    const store = useCanvasStore.getState();
    store.setSelectedNode('node');
    store.openToolDialog({ nodeId: 'node', toolType: NODE_TOOL_TYPES.crop });

    expect(useCanvasStore.getState()).toMatchObject({
      selectedNodeId: 'node',
      activeToolDialog: { nodeId: 'node', toolType: NODE_TOOL_TYPES.crop },
    });

    useCanvasStore.getState().setSelectedNode(null);
    useCanvasStore.getState().closeToolDialog();
    expect(useCanvasStore.getState()).toMatchObject({
      selectedNodeId: null,
      activeToolDialog: null,
    });
  });
});
