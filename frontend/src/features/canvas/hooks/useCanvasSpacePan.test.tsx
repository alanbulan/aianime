// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useViewerImmersiveBody } from '@/features/viewer-kit/useViewerImmersiveBody';

import { useCanvasSpacePan } from './useCanvasSpacePan';

describe('useCanvasSpacePan', () => {
  it('tracks current and legacy space keys and clears marquee state', () => {
    const clearMarqueeSelection = vi.fn();
    const { result } = renderHook(() => useCanvasSpacePan(clearMarqueeSelection));

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Space',
      key: ' ',
    })));
    expect(result.current.isSpacePanActive()).toBe(true);
    expect(clearMarqueeSelection).toHaveBeenCalledOnce();

    act(() => window.dispatchEvent(new KeyboardEvent('keyup', {
      code: 'Unidentified',
      key: 'Spacebar',
    })));
    expect(result.current.isSpacePanActive()).toBe(false);

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Unidentified',
      key: ' ',
    })));
    expect(result.current.isSpacePanActive()).toBe(true);
    act(() => window.dispatchEvent(new Event('blur')));
    expect(result.current.isSpacePanActive()).toBe(false);
    expect(clearMarqueeSelection).toHaveBeenCalledTimes(3);
  });

  it('ignores space from typing targets and while an immersive viewer is active', () => {
    const clearMarqueeSelection = vi.fn();
    const { result } = renderHook(() => useCanvasSpacePan(clearMarqueeSelection));
    const input = document.createElement('input');
    document.body.append(input);

    act(() => input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'Space',
      key: ' ',
    })));
    expect(result.current.isSpacePanActive()).toBe(false);

    const immersiveViewer = renderHook(() => useViewerImmersiveBody(true));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Space',
      key: ' ',
    })));
    expect(result.current.isSpacePanActive()).toBe(false);
    expect(clearMarqueeSelection).not.toHaveBeenCalled();

    immersiveViewer.unmount();
    input.remove();
  });
});
