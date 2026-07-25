// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasNode } from '../domain/canvasNodes';
import { useCanvasMarqueeSelection } from './useCanvasMarqueeSelection';

function pointerEvent(
  type: string,
  options: {
    pointerId: number;
    button?: number;
    clientX?: number;
    clientY?: number;
  },
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
  });
  Object.defineProperty(event, 'pointerId', { value: options.pointerId });
  return event as PointerEvent;
}

function canvasNode(
  id: string,
  position: { x: number; y: number },
  selected = false,
): CanvasNode {
  return {
    id,
    position,
    selected,
    measured: { width: 20, height: 20 },
  } as CanvasNode;
}

describe('useCanvasMarqueeSelection', () => {
  let wrapperElement: HTMLDivElement;
  let paneElement: HTMLDivElement;

  beforeEach(() => {
    wrapperElement = document.createElement('div');
    paneElement = document.createElement('div');
    paneElement.className = 'react-flow__pane';
    wrapperElement.append(paneElement);
    document.body.append(wrapperElement);
    vi.spyOn(wrapperElement, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      right: 410,
      bottom: 320,
      width: 400,
      height: 300,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    wrapperElement.remove();
  });

  it('shows the drag rect, applies selection, and swallows one trailing click', () => {
    const applyNodeSelectionChanges = vi.fn();
    const setNativeSelectionActive = vi.fn();
    const setSelectedNodeId = vi.fn();
    const onMarqueeStart = vi.fn();
    const { result } = renderHook(() =>
      useCanvasMarqueeSelection({
        wrapperRef: { current: wrapperElement },
        disabled: false,
        nodes: [canvasNode('inside', { x: 110, y: 110 })],
        coordinatePort: { screenToFlowPosition: (position) => position },
        applyNodeSelectionChanges,
        setNativeSelectionActive,
        setSelectedNodeId,
        onMarqueeStart,
      }),
    );

    act(() => {
      paneElement.dispatchEvent(pointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      }));
      window.dispatchEvent(pointerEvent('pointermove', {
        pointerId: 1,
        clientX: 120,
        clientY: 130,
      }));
    });
    expect(result.current.marqueeSelectionRect).toEqual({
      left: 90,
      top: 80,
      width: 20,
      height: 30,
    });
    expect(onMarqueeStart).toHaveBeenCalledOnce();
    expect(setSelectedNodeId).toHaveBeenLastCalledWith(null);
    expect(setNativeSelectionActive).toHaveBeenLastCalledWith(false);

    act(() => window.dispatchEvent(pointerEvent('pointerup', {
      pointerId: 1,
      clientX: 150,
      clientY: 150,
    })));
    expect(applyNodeSelectionChanges).toHaveBeenCalledWith([
      { id: 'inside', type: 'select', selected: true },
    ]);
    expect(setNativeSelectionActive).toHaveBeenLastCalledWith(true);
    expect(setSelectedNodeId).toHaveBeenLastCalledWith('inside');
    expect(result.current.marqueeSelectionRect).toBeNull();

    const trailingClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    act(() => paneElement.dispatchEvent(trailingClick));
    expect(trailingClick.defaultPrevented).toBe(true);
    const nextClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    act(() => paneElement.dispatchEvent(nextClick));
    expect(nextClick.defaultPrevented).toBe(false);
  });

  it('selects a fast flick without requiring an intermediate move event', () => {
    const applyNodeSelectionChanges = vi.fn();
    const setNativeSelectionActive = vi.fn();
    const setSelectedNodeId = vi.fn();
    const onMarqueeStart = vi.fn();
    const { result } = renderHook(() =>
      useCanvasMarqueeSelection({
        wrapperRef: { current: wrapperElement },
        disabled: false,
        nodes: [canvasNode('inside', { x: 20, y: 20 })],
        coordinatePort: { screenToFlowPosition: (position) => position },
        applyNodeSelectionChanges,
        setNativeSelectionActive,
        setSelectedNodeId,
        onMarqueeStart,
      }),
    );

    act(() => {
      paneElement.dispatchEvent(pointerEvent('pointerdown', {
        pointerId: 2,
        clientX: 10,
        clientY: 10,
      }));
      window.dispatchEvent(pointerEvent('pointerup', {
        pointerId: 2,
        clientX: 50,
        clientY: 50,
      }));
    });
    expect(applyNodeSelectionChanges).toHaveBeenCalledOnce();
    expect(setSelectedNodeId).toHaveBeenLastCalledWith('inside');
    expect(onMarqueeStart).not.toHaveBeenCalled();
    expect(result.current.marqueeSelectionRect).toBeNull();
  });

  it('ignores disabled, interactive, short, and space-pan gestures', () => {
    const applyNodeSelectionChanges = vi.fn();
    const onMarqueeStart = vi.fn();
    const options = {
      wrapperRef: { current: wrapperElement },
      nodes: [canvasNode('inside', { x: 20, y: 20 })],
      coordinatePort: { screenToFlowPosition: (position: { x: number; y: number }) => position },
      applyNodeSelectionChanges,
      setNativeSelectionActive: vi.fn(),
      setSelectedNodeId: vi.fn(),
      onMarqueeStart,
    };
    const { result, rerender } = renderHook(
      ({ disabled }) => useCanvasMarqueeSelection({ ...options, disabled }),
      { initialProps: { disabled: true } },
    );

    act(() => {
      paneElement.dispatchEvent(pointerEvent('pointerdown', {
        pointerId: 3,
        clientX: 10,
        clientY: 10,
      }));
      window.dispatchEvent(pointerEvent('pointerup', {
        pointerId: 3,
        clientX: 50,
        clientY: 50,
      }));
    });
    rerender({ disabled: false });

    const button = document.createElement('button');
    paneElement.append(button);
    act(() => {
      button.dispatchEvent(pointerEvent('pointerdown', { pointerId: 4 }));
      paneElement.dispatchEvent(pointerEvent('pointerdown', {
        pointerId: 5,
        clientX: 10,
        clientY: 10,
      }));
      window.dispatchEvent(pointerEvent('pointerup', {
        pointerId: 5,
        clientX: 14,
        clientY: 13,
      }));
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'Space',
        key: ' ',
      }));
      paneElement.dispatchEvent(pointerEvent('pointerdown', {
        pointerId: 6,
        clientX: 10,
        clientY: 10,
      }));
      window.dispatchEvent(pointerEvent('pointermove', {
        pointerId: 6,
        clientX: 50,
        clientY: 50,
      }));
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code: 'Space',
        key: ' ',
      }));
    });

    expect(applyNodeSelectionChanges).not.toHaveBeenCalled();
    expect(onMarqueeStart).not.toHaveBeenCalled();
    expect(result.current.marqueeSelectionRect).toBeNull();
  });
});
