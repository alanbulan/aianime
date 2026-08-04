// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasGraphInteractionController,
  type CanvasGraphInteractionControllerOptions,
  type CanvasGraphInteractionEdge,
  type CanvasGraphInteractionNode,
} from './useCanvasGraphInteractionController';

type TestNodeType = 'group' | 'text';

interface TestNode extends CanvasGraphInteractionNode<TestNodeType> {
  selected?: boolean;
}

interface TestEdge extends CanvasGraphInteractionEdge {}

interface TestNodeChange {
  id: string;
  type: 'position' | 'remove' | 'select';
  position?: { x: number; y: number };
  dragging?: boolean;
}

interface TestEdgeChange {
  id: string;
  type: 'remove' | 'select';
}

type TestOptions = CanvasGraphInteractionControllerOptions<
  TestNode,
  TestEdge,
  TestNodeType,
  TestNodeChange,
  TestEdgeChange
>;

function sourceNode(position = { x: 0, y: 0 }): TestNode {
  return {
    id: 'source',
    type: 'text',
    position,
    selected: true,
    data: {},
  };
}

function createOptions(): TestOptions {
  const graph = {
    nodes: [sourceNode()],
    edges: [] as TestEdge[],
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
    groupNodeType: 'group',
    mapPositionCommit: (update) => ({
      id: update.nodeId,
      type: 'position',
      position: update.position,
      dragging: update.dragging,
    }),
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
    const event = { altKey: true };

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
    const change: TestNodeChange = {
      id: 'source',
      type: 'position',
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
