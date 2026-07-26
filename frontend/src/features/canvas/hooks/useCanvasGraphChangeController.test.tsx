// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import type {
  EdgeChange,
  NodeChange,
} from '@xyflow/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  useCanvasGraphChangeController,
  type CanvasGraphChangeControllerOptions,
} from './useCanvasGraphChangeController';

function node(id: string, presetManaged = false): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: { preset_managed: presetManaged },
  } as CanvasNode;
}

function edge(id: string, presetManaged = false): CanvasEdge {
  return {
    id,
    source: 'source',
    target: 'target',
    data: { preset_managed: presetManaged },
  };
}

function createOptions(
  overrides: Partial<CanvasGraphChangeControllerOptions> = {},
): CanvasGraphChangeControllerOptions {
  return {
    getGraph: () => ({ nodes: [], edges: [] }),
    isCopyDragActive: () => false,
    alignNodeChanges: vi.fn(({ changes }) => changes),
    applyNodeChanges: vi.fn(),
    applyEdgeChanges: vi.fn(),
    deleteEdge: vi.fn(),
    ...overrides,
  };
}

describe('useCanvasGraphChangeController', () => {
  it('guards and aligns node changes against the latest graph', () => {
    const nodes = [node('locked', true), node('open')];
    const lockedRemove = {
      id: 'locked',
      type: 'remove',
    } as NodeChange<CanvasNode>;
    const openMove = {
      id: 'open',
      type: 'position',
      position: { x: 10, y: 20 },
      dragging: true,
    } as NodeChange<CanvasNode>;
    const alignedMove = {
      ...openMove,
      position: { x: 12, y: 24 },
    } as NodeChange<CanvasNode>;
    const options = createOptions({
      getGraph: () => ({ nodes, edges: [] }),
      isCopyDragActive: () => true,
      alignNodeChanges: vi.fn(() => [alignedMove]),
    });
    const { result } = renderHook(() =>
      useCanvasGraphChangeController(options),
    );

    act(() => result.current.handleNodesChange([lockedRemove, openMove]));

    expect(options.alignNodeChanges).toHaveBeenCalledWith({
      nodes,
      changes: [openMove],
      copyDragActive: true,
    });
    expect(options.applyNodeChanges).toHaveBeenCalledWith([alignedMove]);
  });

  it('does not align or apply when every node change is blocked', () => {
    const locked = node('locked', true);
    const options = createOptions({
      getGraph: () => ({ nodes: [locked], edges: [] }),
    });
    const { result } = renderHook(() =>
      useCanvasGraphChangeController(options),
    );

    act(() => result.current.handleNodesChange([{
      id: locked.id,
      type: 'remove',
    }] as NodeChange<CanvasNode>[]));

    expect(options.alignNodeChanges).not.toHaveBeenCalled();
    expect(options.applyNodeChanges).not.toHaveBeenCalled();
  });

  it('applies only allowed edge changes from the latest graph', () => {
    const locked = edge('locked', true);
    const open = edge('open');
    const lockedRemove = {
      id: locked.id,
      type: 'remove',
    } as EdgeChange<CanvasEdge>;
    const lockedSelect = {
      id: locked.id,
      type: 'select',
      selected: true,
    } as EdgeChange<CanvasEdge>;
    const openRemove = {
      id: open.id,
      type: 'remove',
    } as EdgeChange<CanvasEdge>;
    const options = createOptions({
      getGraph: () => ({ nodes: [], edges: [locked, open] }),
    });
    const { result } = renderHook(() =>
      useCanvasGraphChangeController(options),
    );

    act(() => result.current.handleEdgesChange([
      lockedRemove,
      lockedSelect,
      openRemove,
    ]));

    expect(options.applyEdgeChanges).toHaveBeenCalledWith([
      lockedSelect,
      openRemove,
    ]);
  });

  it('routes deletable edge double-clicks through the store command', () => {
    const options = createOptions();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as ReactMouseEvent;
    const open = edge('open');
    const { result } = renderHook(() =>
      useCanvasGraphChangeController(options),
    );

    act(() => result.current.handleEdgeDoubleClick(event, open));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(options.deleteEdge).toHaveBeenCalledWith(open.id);
  });

  it('does not invoke the store delete command for a managed edge', () => {
    const options = createOptions();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as ReactMouseEvent;
    const { result } = renderHook(() =>
      useCanvasGraphChangeController(options),
    );

    act(() => result.current.handleEdgeDoubleClick(
      event,
      edge('locked', true),
    ));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(options.deleteEdge).not.toHaveBeenCalled();
  });
});
