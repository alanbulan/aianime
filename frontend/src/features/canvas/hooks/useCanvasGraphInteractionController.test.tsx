// Copyright (c) 2026 AI anime
import type { MouseEvent as ReactMouseEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  useCanvasGraphInteractionController,
  type CanvasGraphInteractionControllerOptions,
} from './useCanvasGraphInteractionController';

function sourceNode(position = { x: 0, y: 0 }): CanvasNode {
  return {
    id: 'source',
    type: CANVAS_NODE_TYPES.textAnnotation,
    position,
    selected: true,
    data: {},
  } as CanvasNode;
}

function createOptions(): CanvasGraphInteractionControllerOptions {
  const graph = {
    nodes: [sourceNode()],
    edges: [] as CanvasEdge[],
  };
  return {
    nodes: graph.nodes,
    selectedNodeIds: ['source'],
    duplicateNodes: vi.fn(() => ({
      idMap: new Map([['source', 'copy']]),
    })),
    elevateNodes: vi.fn(),
    selectNode: vi.fn(),
    getGraph: vi.fn(() => graph),
    fitGroupToChildren: vi.fn(),
    alignNodeChanges: vi.fn(({ changes }) => changes),
    applyNodeChanges: vi.fn(),
    applyEdgeChanges: vi.fn(),
    deleteEdge: vi.fn(),
    clearSnapAlignment: vi.fn(),
  };
}

describe('useCanvasGraphInteractionController', () => {
  it('adapts Alt-drag position commits and lifecycle cleanup once', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasGraphInteractionController(options),
    );
    const event = { altKey: true } as ReactMouseEvent;

    act(() => result.current.handleNodeDragStart(
      event,
      sourceNode(),
      [sourceNode()],
    ));
    act(() => result.current.handleNodeDrag(
      event,
      sourceNode({ x: 30, y: 20 }),
    ));

    expect(options.applyNodeChanges).toHaveBeenCalledWith([
      {
        id: 'source',
        type: 'position',
        position: { x: 0, y: 0 },
        dragging: true,
      },
      {
        id: 'copy',
        type: 'position',
        position: { x: 30, y: 20 },
        dragging: true,
      },
    ]);

    act(() => result.current.handleNodeDragStop(
      event,
      sourceNode({ x: 30, y: 20 }),
    ));
    expect(options.clearSnapAlignment).toHaveBeenCalledOnce();
    expect(options.selectNode).toHaveBeenCalledWith('copy');
  });

  it('routes guarded graph changes through alignment and Store commands', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasGraphInteractionController(options),
    );
    const change = {
      id: 'source',
      type: 'position' as const,
      position: { x: 10, y: 15 },
      dragging: true,
    };

    act(() => result.current.handleNodesChange([change]));

    expect(options.alignNodeChanges).toHaveBeenCalledWith({
      nodes: [sourceNode()],
      changes: [change],
      copyDragActive: false,
    });
    expect(options.applyNodeChanges).toHaveBeenCalledWith([change]);
  });
});
