// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasKeyboardShortcuts,
  type CanvasKeyboardShortcutOptions,
} from './useCanvasKeyboardShortcuts';

function createOptions(
  overrides: Partial<CanvasKeyboardShortcutOptions> = {},
): CanvasKeyboardShortcutOptions {
  return {
    placementActive: false,
    nodeMenuOpen: false,
    canCopySelection: true,
    canGroupSelection: true,
    isImmersiveViewerActive: vi.fn(() => false),
    cancelPlacement: vi.fn(),
    closeNodeMenu: vi.fn(),
    organizeCanvas: vi.fn(),
    copySelection: vi.fn(),
    pasteSelection: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    groupSelection: vi.fn(),
    deleteSelection: vi.fn(() => true),
    ...overrides,
  };
}

function keyboardEvent(
  key: string,
  modifiers: Pick<KeyboardEventInit, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'> = {},
): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
}

describe('useCanvasKeyboardShortcuts', () => {
  it('routes editing shortcuts to semantic commands', () => {
    const options = createOptions();
    renderHook(() => useCanvasKeyboardShortcuts(options));
    const cases: Array<{
      event: KeyboardEvent;
      command: keyof CanvasKeyboardShortcutOptions;
      preventsDefault: boolean;
    }> = [
      { event: keyboardEvent('F', { altKey: true, shiftKey: true }), command: 'organizeCanvas', preventsDefault: true },
      { event: keyboardEvent('c', { ctrlKey: true }), command: 'copySelection', preventsDefault: true },
      { event: keyboardEvent('v', { metaKey: true }), command: 'pasteSelection', preventsDefault: false },
      { event: keyboardEvent('z', { ctrlKey: true }), command: 'undo', preventsDefault: true },
      { event: keyboardEvent('z', { metaKey: true, shiftKey: true }), command: 'redo', preventsDefault: true },
      { event: keyboardEvent('g', { ctrlKey: true }), command: 'groupSelection', preventsDefault: true },
      { event: keyboardEvent('Delete'), command: 'deleteSelection', preventsDefault: true },
    ];

    for (const testCase of cases) {
      act(() => document.dispatchEvent(testCase.event));
      expect(testCase.event.defaultPrevented).toBe(testCase.preventsDefault);
      expect(options[testCase.command]).toHaveBeenCalledOnce();
    }
  });

  it('gives placement cancellation priority over closing the node menu', () => {
    const options = createOptions({
      placementActive: true,
      nodeMenuOpen: true,
    });
    const { rerender } = renderHook(
      ({ placementActive }) => useCanvasKeyboardShortcuts({
        ...options,
        placementActive,
      }),
      { initialProps: { placementActive: true } },
    );

    act(() => document.dispatchEvent(keyboardEvent('Escape')));
    expect(options.cancelPlacement).toHaveBeenCalledOnce();
    expect(options.closeNodeMenu).not.toHaveBeenCalled();

    rerender({ placementActive: false });
    act(() => document.dispatchEvent(keyboardEvent('Escape')));
    expect(options.closeNodeMenu).toHaveBeenCalledOnce();
  });

  it('does not consume unavailable, typing, or immersive shortcuts', () => {
    const options = createOptions({
      canCopySelection: false,
      canGroupSelection: false,
      deleteSelection: vi.fn(() => false),
    });
    renderHook(() => useCanvasKeyboardShortcuts(options));

    const copyEvent = keyboardEvent('c', { ctrlKey: true });
    const groupEvent = keyboardEvent('g', { ctrlKey: true });
    const deleteEvent = keyboardEvent('Backspace');
    act(() => {
      document.dispatchEvent(copyEvent);
      document.dispatchEvent(groupEvent);
      document.dispatchEvent(deleteEvent);
    });

    const input = document.createElement('input');
    document.body.append(input);
    act(() => input.dispatchEvent(keyboardEvent('z', { ctrlKey: true })));

    vi.mocked(options.isImmersiveViewerActive).mockReturnValue(true);
    act(() => document.dispatchEvent(keyboardEvent('z', { ctrlKey: true })));
    input.remove();

    expect(copyEvent.defaultPrevented).toBe(false);
    expect(groupEvent.defaultPrevented).toBe(false);
    expect(deleteEvent.defaultPrevented).toBe(false);
    expect(options.copySelection).not.toHaveBeenCalled();
    expect(options.groupSelection).not.toHaveBeenCalled();
    expect(options.undo).not.toHaveBeenCalled();
  });
});
