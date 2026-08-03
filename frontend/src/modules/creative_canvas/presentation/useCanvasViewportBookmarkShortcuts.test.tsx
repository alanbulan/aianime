// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCanvasViewportBookmarkShortcuts } from './useCanvasViewportBookmarkShortcuts';

function keyboardEvent(
  key: string,
  modifiers: Pick<KeyboardEventInit, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'> = {},
) {
  return new KeyboardEvent('keydown', {
    key,
    cancelable: true,
    ...modifiers,
  });
}

function createOptions(isImmersiveViewerActive = vi.fn(() => false)) {
  return {
    clearBookmarks: vi.fn(),
    captureBookmark: vi.fn(),
    jumpToBookmarkSlot: vi.fn(),
    isImmersiveViewerActive,
  };
}

describe('useCanvasViewportBookmarkShortcuts', () => {
  it('routes clear, capture, and jump shortcuts to injected commands', () => {
    const options = createOptions();
    renderHook(() => useCanvasViewportBookmarkShortcuts(options));

    const clearEvent = keyboardEvent('E', { ctrlKey: true, shiftKey: true });
    act(() => window.dispatchEvent(clearEvent));
    expect(clearEvent.defaultPrevented).toBe(true);
    expect(options.clearBookmarks).toHaveBeenCalledOnce();

    const captureEvent = keyboardEvent('3', { metaKey: true });
    act(() => window.dispatchEvent(captureEvent));
    expect(captureEvent.defaultPrevented).toBe(true);
    expect(options.captureBookmark).toHaveBeenCalledWith(2);

    const jumpEvent = keyboardEvent('0');
    act(() => window.dispatchEvent(jumpEvent));
    expect(jumpEvent.defaultPrevented).toBe(true);
    expect(options.jumpToBookmarkSlot).toHaveBeenCalledWith(9);
  });

  it('ignores modified digits, typing targets, and immersive viewers', () => {
    const options = createOptions();
    renderHook(() => useCanvasViewportBookmarkShortcuts(options));

    act(() => {
      window.dispatchEvent(keyboardEvent('1', { shiftKey: true }));
      window.dispatchEvent(keyboardEvent('2', { altKey: true }));
      window.dispatchEvent(keyboardEvent('x'));
    });

    const input = document.createElement('input');
    document.body.append(input);
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: '1',
    })));

    options.isImmersiveViewerActive.mockReturnValue(true);
    act(() => window.dispatchEvent(keyboardEvent('1')));
    input.remove();

    expect(options.clearBookmarks).not.toHaveBeenCalled();
    expect(options.captureBookmark).not.toHaveBeenCalled();
    expect(options.jumpToBookmarkSlot).not.toHaveBeenCalled();
  });
});
