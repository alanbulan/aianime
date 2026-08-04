// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasGroupFitDragController,
  type CanvasGroupFitDragControllerOptions,
} from './useCanvasGroupFitDragController';

interface TestNode {
  id: string;
  parentId?: string;
}

function node(id: string, parentId?: string): TestNode {
  return { id, parentId };
}

function createOptions(): CanvasGroupFitDragControllerOptions<TestNode> {
  return {
    getGraph: vi.fn(() => ({
      nodes: [
        node('child-a', 'group-a'),
        node('child-b', 'group-b'),
        node('child-c', 'group-a'),
        node('top-level'),
      ],
    })),
    fitGroupToChildren: vi.fn(),
  };
}

describe('useCanvasGroupFitDragController', () => {
  it('deduplicates parent groups and fits them on finish', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasGroupFitDragController(options),
    );

    act(() => {
      result.current.beginNodeDrag(
        false,
        'child-a',
        ['child-a', 'child-b', 'child-c', 'top-level'],
      );
      result.current.finishDrag();
    });

    expect(options.getGraph).toHaveBeenCalledOnce();
    expect(options.fitGroupToChildren).toHaveBeenNthCalledWith(1, 'group-a');
    expect(options.fitGroupToChildren).toHaveBeenNthCalledWith(2, 'group-b');
  });

  it('falls back to the primary node when the dragged list is empty', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasGroupFitDragController(options),
    );

    act(() => {
      result.current.beginNodeDrag(false, 'child-b', []);
      result.current.finishDrag();
    });

    expect(options.fitGroupToChildren).toHaveBeenCalledWith('group-b');
  });

  it('clears a pending fit plan when the next node drag holds Alt', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasGroupFitDragController(options),
    );

    act(() => {
      result.current.beginNodeDrag(false, 'child-a', ['child-a']);
      result.current.beginNodeDrag(true, 'child-a', ['child-a']);
      result.current.finishDrag();
    });

    expect(options.getGraph).toHaveBeenCalledOnce();
    expect(options.fitGroupToChildren).not.toHaveBeenCalled();
  });

  it('uses the same finish path for selection dragging', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasGroupFitDragController(options),
    );

    act(() => {
      result.current.beginSelectionDrag(['child-b', 'child-a', 'missing']);
      result.current.finishDrag();
      result.current.finishDrag();
    });

    expect(options.fitGroupToChildren).toHaveBeenNthCalledWith(1, 'group-b');
    expect(options.fitGroupToChildren).toHaveBeenNthCalledWith(2, 'group-a');
    expect(options.fitGroupToChildren).toHaveBeenCalledTimes(2);
  });
});
