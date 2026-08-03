// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasSnapAlignment,
  type CanvasSnapAlignmentNode,
  type CanvasSnapAlignmentPort,
} from './useCanvasSnapAlignment';

interface TestNode extends CanvasSnapAlignmentNode {
  excluded?: boolean;
}

function node(
  id: string,
  x: number,
  y: number,
  excluded = false,
): TestNode {
  return {
    id,
    position: { x, y },
    width: 200,
    height: 100,
    excluded,
  };
}

function createPort(enabled = true): CanvasSnapAlignmentPort<TestNode> {
  return {
    isEnabled: vi.fn(() => enabled),
    isExcludedNode: vi.fn((candidate) => candidate.excluded === true),
    setGuides: vi.fn(),
    clearGuides: vi.fn(),
  };
}

describe('useCanvasSnapAlignment', () => {
  it('snaps one dragged node and publishes its guide lines', () => {
    const port = createPort();
    const { result } = renderHook(() => useCanvasSnapAlignment(port));
    const change = {
      id: 'dragged',
      type: 'position',
      position: { x: 3, y: 50 },
      dragging: true,
    };

    const aligned = result.current.alignNodeChanges({
      nodes: [node('dragged', 0, 0), node('anchor', 0, 300)],
      changes: [change],
      copyDragActive: false,
    });

    expect(aligned[0].position).toEqual({ x: 0, y: 50 });
    expect(port.setGuides).toHaveBeenCalledWith({
      vertical: [0, 100, 200],
      horizontal: [],
    });
  });

  it('excludes nodes selected by the composition port from the snap index', () => {
    const port = createPort();
    const { result } = renderHook(() => useCanvasSnapAlignment(port));
    const change = {
      id: 'dragged',
      type: 'position',
      position: { x: 3, y: 50 },
      dragging: true,
    };

    const aligned = result.current.alignNodeChanges({
      nodes: [node('dragged', 0, 0), node('group', 0, 300, true)],
      changes: [change],
      copyDragActive: false,
    });

    expect(aligned[0].position).toEqual({ x: 3, y: 50 });
    expect(port.setGuides).toHaveBeenCalledWith({
      vertical: [],
      horizontal: [],
    });
  });

  it('leaves disabled and copy drags unchanged and clears guides for multi-drag', () => {
    const disabledPort = createPort(false);
    const disabled = renderHook(() => useCanvasSnapAlignment(disabledPort));
    const changes = [{
      id: 'node-1',
      type: 'position',
      position: { x: 3, y: 50 },
      dragging: true,
    }];
    expect(disabled.result.current.alignNodeChanges({
      nodes: [node('node-1', 0, 0), node('anchor', 0, 300)],
      changes,
      copyDragActive: false,
    })).toEqual(changes);

    const port = createPort();
    const active = renderHook(() => useCanvasSnapAlignment(port));
    expect(active.result.current.alignNodeChanges({
      nodes: [node('node-1', 0, 0), node('anchor', 0, 300)],
      changes,
      copyDragActive: true,
    })).toEqual(changes);
    active.result.current.alignNodeChanges({
      nodes: [node('node-1', 0, 0), node('node-2', 10, 10)],
      changes: [changes[0], { ...changes[0], id: 'node-2' }],
      copyDragActive: false,
    });
    expect(port.clearGuides).toHaveBeenCalledOnce();
  });

  it('clears the cached index when a drag finishes', () => {
    const port = createPort();
    const { result } = renderHook(() => useCanvasSnapAlignment(port));
    const change = {
      id: 'dragged',
      type: 'position',
      position: { x: 3, y: 50 },
      dragging: true,
    };
    result.current.alignNodeChanges({
      nodes: [node('dragged', 0, 0), node('anchor', 0, 300)],
      changes: [change],
      copyDragActive: false,
    });

    act(() => result.current.clearSnapAlignment());
    const aligned = result.current.alignNodeChanges({
      nodes: [node('dragged', 0, 0), node('anchor', 100, 300)],
      changes: [{ ...change, position: { x: 103, y: 50 } }],
      copyDragActive: false,
    });

    expect(port.clearGuides).toHaveBeenCalledOnce();
    expect(aligned[0].position).toEqual({ x: 100, y: 50 });
  });
});
