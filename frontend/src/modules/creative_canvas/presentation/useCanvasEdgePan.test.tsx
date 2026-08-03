// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasEdgePan } from './useCanvasEdgePan';

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
    button: options.button ?? 0,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
  });
  Object.defineProperty(event, 'pointerId', { value: options.pointerId });
  return event as PointerEvent;
}

describe('useCanvasEdgePan', () => {
  let wrapperElement: HTMLDivElement;
  let edgePathElement: HTMLDivElement;

  beforeEach(() => {
    wrapperElement = document.createElement('div');
    edgePathElement = document.createElement('div');
    edgePathElement.className = 'react-flow__edge-path';
    wrapperElement.append(edgePathElement);
    document.body.append(wrapperElement);
  });

  afterEach(() => {
    wrapperElement.remove();
  });

  it('pans after the drag threshold, commits on release, and consumes one click', () => {
    let viewport = { x: 10, y: 20, zoom: 2 };
    const viewportPort = {
      getViewport: vi.fn(() => viewport),
      setViewport: vi.fn((nextViewport: typeof viewport) => {
        viewport = nextViewport;
      }),
    };
    const commitViewport = vi.fn();
    const { result } = renderHook(() =>
      useCanvasEdgePan({
        wrapperRef: { current: wrapperElement },
        viewportPort,
        commitViewport,
      }),
    );

    act(() => {
      edgePathElement.dispatchEvent(pointerEvent('pointerdown', {
        pointerId: 7,
        clientX: 100,
        clientY: 100,
      }));
      window.dispatchEvent(pointerEvent('pointermove', {
        pointerId: 7,
        clientX: 102,
        clientY: 102,
      }));
    });
    expect(viewportPort.setViewport).not.toHaveBeenCalled();

    act(() => window.dispatchEvent(pointerEvent('pointermove', {
      pointerId: 7,
      clientX: 110,
      clientY: 115,
    })));
    expect(viewportPort.setViewport).toHaveBeenLastCalledWith(
      { x: 20, y: 35, zoom: 2 },
      { duration: 0 },
    );

    act(() => window.dispatchEvent(pointerEvent('pointerup', { pointerId: 7 })));
    expect(commitViewport).toHaveBeenCalledOnce();
    expect(commitViewport).toHaveBeenLastCalledWith({ x: 20, y: 35, zoom: 2 });

    const firstClick = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    act(() => result.current.handleEdgeClick(firstClick));
    expect(firstClick.preventDefault).toHaveBeenCalledOnce();
    expect(firstClick.stopPropagation).toHaveBeenCalledOnce();
    const nextClick = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    act(() => result.current.handleEdgeClick(nextClick));
    expect(nextClick.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores edge updaters, non-primary buttons, and mismatched pointers', () => {
    const viewport = { x: 10, y: 20, zoom: 2 };
    const viewportPort = {
      getViewport: vi.fn(() => viewport),
      setViewport: vi.fn(),
    };
    const commitViewport = vi.fn();
    renderHook(() =>
      useCanvasEdgePan({
        wrapperRef: { current: wrapperElement },
        viewportPort,
        commitViewport,
      }),
    );
    const updater = document.createElement('div');
    updater.className = 'react-flow__edgeupdater';
    edgePathElement.append(updater);

    act(() => {
      updater.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1 }));
      edgePathElement.dispatchEvent(pointerEvent('pointerdown', {
        pointerId: 2,
        button: 2,
      }));
      window.dispatchEvent(pointerEvent('pointermove', {
        pointerId: 1,
        clientX: 20,
        clientY: 20,
      }));
    });
    expect(viewportPort.getViewport).not.toHaveBeenCalled();
    expect(viewportPort.setViewport).not.toHaveBeenCalled();

    act(() => {
      edgePathElement.dispatchEvent(pointerEvent('pointerdown', {
        pointerId: 3,
        clientX: 10,
        clientY: 10,
      }));
      window.dispatchEvent(pointerEvent('pointermove', {
        pointerId: 4,
        clientX: 30,
        clientY: 30,
      }));
      window.dispatchEvent(pointerEvent('pointercancel', { pointerId: 4 }));
    });
    expect(viewportPort.setViewport).not.toHaveBeenCalled();
    expect(commitViewport).not.toHaveBeenCalled();
  });
});
