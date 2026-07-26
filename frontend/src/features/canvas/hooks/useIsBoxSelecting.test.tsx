// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import { useCanvasStore } from '@/stores/canvasStore';
import { useIsBoxSelecting } from './useIsBoxSelecting';

function node(id: string, selected: boolean): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    selected,
    data: {},
  } as CanvasNode;
}

describe('useIsBoxSelecting', () => {
  beforeEach(() => {
    useCanvasStore.getState().setCanvasData([], []);
  });

  it('activates only when more than one node is selected', () => {
    const { result } = renderHook(() => useIsBoxSelecting());
    expect(result.current).toBe(false);

    act(() => {
      useCanvasStore.setState({ nodes: [node('first', true)] });
    });
    expect(result.current).toBe(false);

    act(() => {
      useCanvasStore.setState({
        nodes: [node('first', true), node('second', true)],
      });
    });
    expect(result.current).toBe(true);
  });
});
