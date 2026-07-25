// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useViewerImmersiveBody } from '@/features/viewer-kit/useViewerImmersiveBody';

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

describe('useCanvasViewportBookmarkShortcuts', () => {
  it('routes clear, capture, and jump shortcuts to injected commands', () => {
    const commands = {
      clearBookmarks: vi.fn(),
      captureBookmark: vi.fn(),
      jumpToBookmarkSlot: vi.fn(),
    };
    renderHook(() => useCanvasViewportBookmarkShortcuts(commands));

    const clearEvent = keyboardEvent('E', { ctrlKey: true, shiftKey: true });
    act(() => window.dispatchEvent(clearEvent));
    expect(clearEvent.defaultPrevented).toBe(true);
    expect(commands.clearBookmarks).toHaveBeenCalledOnce();

    const captureEvent = keyboardEvent('3', { metaKey: true });
    act(() => window.dispatchEvent(captureEvent));
    expect(captureEvent.defaultPrevented).toBe(true);
    expect(commands.captureBookmark).toHaveBeenCalledWith(2);

    const jumpEvent = keyboardEvent('0');
    act(() => window.dispatchEvent(jumpEvent));
    expect(jumpEvent.defaultPrevented).toBe(true);
    expect(commands.jumpToBookmarkSlot).toHaveBeenCalledWith(9);
  });

  it('ignores modified digits, typing targets, and immersive viewers', () => {
    const commands = {
      clearBookmarks: vi.fn(),
      captureBookmark: vi.fn(),
      jumpToBookmarkSlot: vi.fn(),
    };
    renderHook(() => useCanvasViewportBookmarkShortcuts(commands));

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

    const immersiveViewer = renderHook(() => useViewerImmersiveBody(true));
    act(() => window.dispatchEvent(keyboardEvent('1')));
    immersiveViewer.unmount();
    input.remove();

    expect(commands.clearBookmarks).not.toHaveBeenCalled();
    expect(commands.captureBookmark).not.toHaveBeenCalled();
    expect(commands.jumpToBookmarkSlot).not.toHaveBeenCalled();
  });
});
