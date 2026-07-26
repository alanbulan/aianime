// Copyright (c) 2026 AI anime
import type { MouseEvent as ReactMouseEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CANVAS_NODE_TYPES, type CanvasNode } from '../domain/canvasNodes';
import {
  useCanvasDragLifecycleController,
  type CanvasDragLifecycleControllerOptions,
} from './useCanvasDragLifecycleController';

function node(id: string, x = 0, y = 0): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x, y },
    data: {},
  } as CanvasNode;
}

function createOptions(): CanvasDragLifecycleControllerOptions {
  return {
    beginGroupFitNodeDrag: vi.fn(),
    beginGroupFitSelectionDrag: vi.fn(),
    finishGroupFitDrag: vi.fn(),
    beginLinkedCaptureDrag: vi.fn(),
    updateLinkedCaptureDrag: vi.fn(),
    finishLinkedCaptureDrag: vi.fn(),
    beginAltDragCopy: vi.fn(),
    updateAltDragCopy: vi.fn(),
    finishAltDragCopy: vi.fn(),
    clearSnapAlignment: vi.fn(),
  };
}

function expectCallOrder(...calls: Array<ReturnType<typeof vi.fn>>): void {
  const order = calls.map((call) => call.mock.invocationCallOrder[0]);
  expect(order).toEqual([...order].sort((left, right) => left! - right!));
}

describe('useCanvasDragLifecycleController', () => {
  it('starts group, linked-capture and Alt-copy controllers in order', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasDragLifecycleController(options),
    );
    const dragged = node('dragged');

    act(() => result.current.handleNodeDragStart(
      { altKey: true } as ReactMouseEvent,
      dragged,
      [dragged, node('selected')],
    ));

    expect(options.beginGroupFitNodeDrag).toHaveBeenCalledWith(
      true,
      'dragged',
      ['dragged', 'selected'],
    );
    expect(options.beginLinkedCaptureDrag).toHaveBeenCalledWith(
      true,
      'dragged',
      2,
    );
    expect(options.beginAltDragCopy).toHaveBeenCalledWith(true, 'dragged');
    expectCallOrder(
      options.beginGroupFitNodeDrag as ReturnType<typeof vi.fn>,
      options.beginLinkedCaptureDrag as ReturnType<typeof vi.fn>,
      options.beginAltDragCopy as ReturnType<typeof vi.fn>,
    );
  });

  it('updates linked capture before Alt-copy and preserves stop order', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasDragLifecycleController(options),
    );
    const dragged = node('dragged', 120, 240);
    const event = {} as ReactMouseEvent;

    act(() => result.current.handleNodeDrag(event, dragged));

    expect(options.updateLinkedCaptureDrag).toHaveBeenCalledWith({ x: 120, y: 240 });
    expect(options.updateAltDragCopy).toHaveBeenCalledWith(
      'dragged',
      { x: 120, y: 240 },
    );
    expectCallOrder(
      options.updateLinkedCaptureDrag as ReturnType<typeof vi.fn>,
      options.updateAltDragCopy as ReturnType<typeof vi.fn>,
    );

    vi.clearAllMocks();
    act(() => result.current.handleNodeDragStop(event, dragged));

    expect(options.finishAltDragCopy).toHaveBeenCalledWith(
      'dragged',
      { x: 120, y: 240 },
    );
    expectCallOrder(
      options.clearSnapAlignment as ReturnType<typeof vi.fn>,
      options.finishLinkedCaptureDrag as ReturnType<typeof vi.fn>,
      options.finishGroupFitDrag as ReturnType<typeof vi.fn>,
      options.finishAltDragCopy as ReturnType<typeof vi.fn>,
    );
  });

  it('maps selection drags to group-fit lifecycle commands', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasDragLifecycleController(options),
    );

    act(() => result.current.handleSelectionDragStart(
      {} as ReactMouseEvent,
      [node('node-a'), node('node-b')],
    ));
    act(() => result.current.handleSelectionDragStop());

    expect(options.beginGroupFitSelectionDrag).toHaveBeenCalledWith([
      'node-a',
      'node-b',
    ]);
    expect(options.finishGroupFitDrag).toHaveBeenCalledOnce();
  });
});
