// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasGraphChangeController,
  type CanvasGraphChangeControllerOptions,
} from './useCanvasGraphChangeController';

interface TestNode {
  id: string;
  data: { preset_managed?: boolean };
}

interface TestEdge {
  id: string;
  source: string;
  target: string;
  data?: { preset_managed?: boolean };
}

interface TestNodeChange {
  id: string;
  type: string;
  position?: { x: number; y: number };
  dragging?: boolean;
}

interface TestEdgeChange {
  id: string;
  type: string;
  selected?: boolean;
}

type TestOptions = CanvasGraphChangeControllerOptions<
  TestNode,
  TestEdge,
  TestNodeChange,
  TestEdgeChange
>;

function node(id: string, presetManaged = false): TestNode {
  return { id, data: { preset_managed: presetManaged } };
}

function edge(id: string, presetManaged = false): TestEdge {
  return {
    id,
    source: 'source',
    target: 'target',
    data: { preset_managed: presetManaged },
  };
}

function createOptions(overrides: Partial<TestOptions> = {}): TestOptions {
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
    const lockedRemove: TestNodeChange = { id: 'locked', type: 'remove' };
    const openMove: TestNodeChange = {
      id: 'open',
      type: 'position',
      position: { x: 10, y: 20 },
      dragging: true,
    };
    const alignedMove: TestNodeChange = {
      ...openMove,
      position: { x: 12, y: 24 },
    };
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
    }]));

    expect(options.alignNodeChanges).not.toHaveBeenCalled();
    expect(options.applyNodeChanges).not.toHaveBeenCalled();
  });

  it('applies only allowed edge changes from the latest graph', () => {
    const locked = edge('locked', true);
    const open = edge('open');
    const lockedRemove: TestEdgeChange = { id: locked.id, type: 'remove' };
    const lockedSelect: TestEdgeChange = {
      id: locked.id,
      type: 'select',
      selected: true,
    };
    const openRemove: TestEdgeChange = { id: open.id, type: 'remove' };
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

  it('routes deletable edge double-clicks through the graph command', () => {
    const options = createOptions();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const open = edge('open');
    const { result } = renderHook(() =>
      useCanvasGraphChangeController(options),
    );

    act(() => result.current.handleEdgeDoubleClick(event, open));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(options.deleteEdge).toHaveBeenCalledWith(open.id);
  });

  it('does not delete a managed edge', () => {
    const options = createOptions();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
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
