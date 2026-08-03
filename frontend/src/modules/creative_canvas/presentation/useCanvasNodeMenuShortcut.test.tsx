// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasNodeMenuShortcut } from './useCanvasNodeMenuShortcut';

function pointerMove(
  target: EventTarget,
  clientX: number,
  clientY: number,
): ReactPointerEvent<HTMLDivElement> {
  return { target, clientX, clientY } as ReactPointerEvent<HTMLDivElement>;
}

describe('useCanvasNodeMenuShortcut', () => {
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
    vi.spyOn(paneElement, 'getBoundingClientRect').mockReturnValue({
      left: 30,
      top: 40,
      right: 330,
      bottom: 240,
      width: 300,
      height: 200,
      x: 30,
      y: 40,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    wrapperElement.remove();
  });

  it('opens the node menu at the latest empty-pane pointer position', () => {
    const openNodeMenu = vi.fn();
    const { result } = renderHook(() =>
      useCanvasNodeMenuShortcut({
        wrapperRef: { current: wrapperElement },
        placementActive: false,
        setPlacementClientPosition: vi.fn(),
        openNodeMenu,
        isImmersiveViewerActive: () => false,
      }),
    );

    act(() => result.current.handleCanvasPointerMove(
      pointerMove(paneElement, 120, 90),
    ));
    expect(result.current.getLastCanvasPointerPosition()).toEqual({ x: 120, y: 90 });
    expect(result.current.getPreferredCanvasPointerPosition()).toEqual({ x: 120, y: 90 });

    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      cancelable: true,
    });
    act(() => window.dispatchEvent(tabEvent));
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(openNodeMenu).toHaveBeenCalledWith({ x: 120, y: 90 });
  });

  it('falls back to the pane center and ignores blocked shortcuts', () => {
    const openNodeMenu = vi.fn();
    const isImmersiveViewerActive = vi.fn(() => false);
    const { result } = renderHook(() =>
      useCanvasNodeMenuShortcut({
        wrapperRef: { current: wrapperElement },
        placementActive: false,
        setPlacementClientPosition: vi.fn(),
        openNodeMenu,
        isImmersiveViewerActive,
      }),
    );

    expect(result.current.getPreferredCanvasPointerPosition()).toEqual({ x: 180, y: 140 });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })));
    expect(openNodeMenu).toHaveBeenLastCalledWith({ x: 180, y: 140 });

    const input = document.createElement('input');
    document.body.append(input);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Tab',
      }));
    });
    isImmersiveViewerActive.mockReturnValue(true);
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })));
    input.remove();

    expect(openNodeMenu).toHaveBeenCalledTimes(1);
  });

  it('updates placement position inside the wrapper and ignores interactive hover otherwise', () => {
    const setPlacementClientPosition = vi.fn();
    const options = {
      wrapperRef: { current: wrapperElement },
      setPlacementClientPosition,
      openNodeMenu: vi.fn(),
      isImmersiveViewerActive: () => false,
    };
    const { result, rerender } = renderHook(
      ({ placementActive }) => useCanvasNodeMenuShortcut({
        ...options,
        placementActive,
      }),
      { initialProps: { placementActive: true } },
    );

    act(() => {
      result.current.handleCanvasPointerMove(pointerMove(paneElement, 100, 100));
      result.current.handleCanvasPointerMove(pointerMove(paneElement, 500, 500));
    });
    expect(setPlacementClientPosition).toHaveBeenCalledOnce();
    expect(setPlacementClientPosition).toHaveBeenCalledWith({ x: 100, y: 100 });

    rerender({ placementActive: false });
    const button = document.createElement('button');
    paneElement.append(button);
    act(() => result.current.handleCanvasPointerMove(pointerMove(button, 200, 150)));
    expect(result.current.getLastCanvasPointerPosition()).toEqual({ x: 100, y: 100 });
  });
});
