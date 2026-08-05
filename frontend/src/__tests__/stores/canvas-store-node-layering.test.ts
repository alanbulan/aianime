// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from 'vitest';

;


import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
import { useCanvasStore } from "@/modules/creative_canvas/public";
describe('canvasStore node layering', () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData(
      [
        {
          id: 'node-1',
          type: CANVAS_NODE_TYPES.upload,
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: 'node-2',
          type: CANVAS_NODE_TYPES.upload,
          position: { x: 100, y: 0 },
          data: {},
          style: { opacity: 0.75 },
        },
      ],
      [],
    );
  });

  it('elevates selected nodes without adding undo history', () => {
    useCanvasStore.getState().elevateNodes(['node-2'], 2000);

    const state = useCanvasStore.getState();
    expect(state.nodes[0]?.zIndex).toBeUndefined();
    expect(state.nodes[1]?.zIndex).toBe(2000);
    expect(state.nodes[1]?.style).toEqual({ opacity: 0.75, zIndex: 2000 });
    expect(state.history.past).toHaveLength(0);
    expect(state.history.future).toHaveLength(0);
  });
});
