// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  useCanvasSelectionCommandController,
  type CanvasSelectionCommandControllerOptions,
} from './useCanvasSelectionCommandController';

function node(id: string): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: {},
  } as CanvasNode;
}

function selectedEdge(id: string): CanvasEdge {
  return {
    id,
    source: 'node-a',
    target: 'node-b',
    selected: true,
  } as CanvasEdge;
}

function createOptions(
  overrides: Partial<CanvasSelectionCommandControllerOptions> = {},
): CanvasSelectionCommandControllerOptions {
  return {
    nodes: [node('node-a'), node('node-b')],
    selectedNodeIds: ['node-a', 'node-b'],
    selectedNodeId: null,
    getCurrentEdges: vi.fn(() => [selectedEdge('edge-1')]),
    groupNodes: vi.fn(),
    deleteEdge: vi.fn(),
    deleteNode: vi.fn(),
    deleteNodes: vi.fn(),
    ...overrides,
  };
}

describe('useCanvasSelectionCommandController', () => {
  it('groups the current box selection through the injected command', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasSelectionCommandController(options),
    );

    act(() => result.current.groupSelection());

    expect(options.groupNodes).toHaveBeenCalledWith(['node-a', 'node-b']);
  });

  it('deletes selected edges before dispatching the matching node command', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasSelectionCommandController(options),
    );

    let handled = false;
    act(() => {
      handled = result.current.deleteSelection();
    });

    expect(handled).toBe(true);
    expect(options.getCurrentEdges).toHaveBeenCalledOnce();
    expect(options.deleteEdge).toHaveBeenCalledWith('edge-1');
    expect(options.deleteNodes).toHaveBeenCalledWith(['node-a', 'node-b']);
    expect(options.deleteNode).not.toHaveBeenCalled();
  });

  it('uses the single-node command for the focused-node fallback', () => {
    const options = createOptions({
      selectedNodeIds: [],
      selectedNodeId: 'node-a',
      getCurrentEdges: vi.fn(() => []),
    });
    const { result } = renderHook(() =>
      useCanvasSelectionCommandController(options),
    );

    act(() => {
      result.current.deleteSelection();
    });

    expect(options.deleteNode).toHaveBeenCalledWith('node-a');
    expect(options.deleteNodes).not.toHaveBeenCalled();
  });
});
