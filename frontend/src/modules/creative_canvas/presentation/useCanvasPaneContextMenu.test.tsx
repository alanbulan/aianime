// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasPaneContextMenu } from './useCanvasPaneContextMenu';

describe('useCanvasPaneContextMenu', () => {
  let wrapperElement: HTMLDivElement;
  let paneElement: HTMLDivElement;

  beforeEach(() => {
    wrapperElement = document.createElement('div');
    paneElement = document.createElement('div');
    paneElement.className = 'react-flow__pane';
    wrapperElement.append(paneElement);
    document.body.append(wrapperElement);
    vi.spyOn(wrapperElement, 'getBoundingClientRect').mockReturnValue({
      left: 40,
      top: 25,
      right: 440,
      bottom: 325,
      width: 400,
      height: 300,
      x: 40,
      y: 25,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    wrapperElement.remove();
  });

  it('opens at pane-relative coordinates with current capabilities', () => {
    const getCapabilities = vi.fn(() => ({
      canUndo: true,
      canRedo: false,
      canPaste: true,
    }));
    const { result } = renderHook(() =>
      useCanvasPaneContextMenu({
        wrapperRef: { current: wrapperElement },
        disabled: false,
        getCapabilities,
      }),
    );
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 140,
      clientY: 75,
    });

    act(() => paneElement.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(getCapabilities).toHaveBeenCalledOnce();
    expect(result.current.contextMenu).toEqual({
      x: 100,
      y: 50,
      clientX: 140,
      clientY: 75,
      canUndo: true,
      canRedo: false,
      canPaste: true,
    });

    act(() => result.current.closeContextMenu());
    expect(result.current.contextMenu).toBeNull();
  });

  it('ignores interactive descendants and suppresses opening while disabled', () => {
    const getCapabilities = vi.fn(() => ({
      canUndo: false,
      canRedo: false,
      canPaste: false,
    }));
    const button = document.createElement('button');
    paneElement.append(button);
    const { result, rerender } = renderHook(
      ({ disabled }) => useCanvasPaneContextMenu({
        wrapperRef: { current: wrapperElement },
        disabled,
        getCapabilities,
      }),
      { initialProps: { disabled: false } },
    );

    const buttonEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    act(() => button.dispatchEvent(buttonEvent));
    expect(buttonEvent.defaultPrevented).toBe(false);
    expect(result.current.contextMenu).toBeNull();

    rerender({ disabled: true });
    const disabledEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    act(() => paneElement.dispatchEvent(disabledEvent));
    expect(disabledEvent.defaultPrevented).toBe(true);
    expect(result.current.contextMenu).toBeNull();
    expect(getCapabilities).not.toHaveBeenCalled();
  });
});
