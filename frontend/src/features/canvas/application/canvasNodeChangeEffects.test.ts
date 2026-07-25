// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  NODE_TOOL_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  applyCanvasNodeChangeEffects,
  type CanvasNodeChangeEffectState,
} from './canvasNodeChangeEffects';

function node(
  id: string,
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.exportImage,
    position: { x: 0, y: 0 },
    data: { imageUrl: '/image.png', aspectRatio: '2:1' },
    ...overrides,
  } as CanvasNode;
}

function state(currentNode: CanvasNode): CanvasNodeChangeEffectState {
  return {
    nodes: [currentNode],
    edges: [],
    selectedNodeId: currentNode.id,
    activeToolDialog: {
      nodeId: currentNode.id,
      toolType: NODE_TOOL_TYPES.crop,
    },
    history: { past: [], future: [] },
    dragHistorySnapshot: null,
    userEditsSinceHydrate: 0,
    lastMutationSource: null,
    pendingClearIntent: false,
  };
}

describe('Canvas node change effects', () => {
  it('keeps automatic measurement view-only', () => {
    const current = node('image');
    const changed = { ...current, measured: { width: 400, height: 200 } };
    const currentState = state(current);

    const result = applyCanvasNodeChangeEffects(
      currentState,
      [changed],
      [{ id: current.id, type: 'dimensions' }],
    );

    expect(result.nodes).toEqual([changed]);
    expect(result.history).toBe(currentState.history);
    expect(result.dragHistorySnapshot).toBeNull();
    expect(result).not.toHaveProperty('userEditsSinceHydrate');
    expect(result.nodes[0]?.data).not.toHaveProperty('isSizeManuallyAdjusted');
  });

  it('locks media sizing and records one edit when resize ends', () => {
    const current = node('image', {
      width: 400,
      height: 400,
      style: { width: 400, height: 400 },
    });
    const result = applyCanvasNodeChangeEffects(
      state(current),
      [current],
      [{ id: current.id, type: 'dimensions', resizing: false }],
    );

    expect(result.nodes[0]).toMatchObject({
      width: 400,
      height: 200,
      style: { width: 400, height: 200 },
      data: { isSizeManuallyAdjusted: true },
    });
    expect(result.history.past).toHaveLength(1);
    expect(result.userEditsSinceHydrate).toBe(1);
    expect(result.lastMutationSource).toBe('user_edit');
  });

  it('clears node-bound UI and records deletion to empty', () => {
    const current = node('image');
    const result = applyCanvasNodeChangeEffects(
      state(current),
      [],
      [{ id: current.id, type: 'remove' }],
    );

    expect(result.nodes).toEqual([]);
    expect(result.selectedNodeId).toBeNull();
    expect(result.activeToolDialog).toBeNull();
    expect(result.history.past).toHaveLength(1);
    expect(result.lastMutationSource).toBe('delete_to_empty');
  });
});
