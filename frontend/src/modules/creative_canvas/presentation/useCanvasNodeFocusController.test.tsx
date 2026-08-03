// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasNodeFocusController,
  type CanvasNodeFocusRuntimePort,
} from './useCanvasNodeFocusController';
import type { CanvasFocusableNode } from './useCanvasPendingNodeFocus';

function canvasNode(): CanvasFocusableNode {
  return {
    id: 'node-1',
    position: { x: 10, y: 20 },
  };
}

describe('useCanvasNodeFocusController', () => {
  it('adapts the runtime viewport for pending and explicit node focus', () => {
    const setCenter = vi.fn();
    const runtimePort: CanvasNodeFocusRuntimePort = {
      getInternalNode: vi.fn(() => ({
        internals: { positionAbsolute: { x: 100, y: 200 } },
      })),
      getZoom: vi.fn(() => 0.4),
      setCenter,
    };
    const clearPendingFocus = vi.fn();
    const { result } = renderHook(() =>
      useCanvasNodeFocusController({
        pendingNodeId: 'node-1',
        nodes: [canvasNode()],
        runtimePort,
        resolveNodeSize: () => ({ width: 400, height: 240 }),
        clearPendingFocus,
      }),
    );

    expect(runtimePort.getInternalNode).toHaveBeenCalledWith('node-1');
    expect(setCenter).toHaveBeenCalledWith(
      300,
      320,
      { zoom: 0.6, duration: 320 },
    );
    expect(clearPendingFocus).toHaveBeenCalledOnce();

    act(() => {
      result.current.centerViewport(
        { x: 50, y: 60 },
        { zoom: 1, duration: 200 },
      );
    });
    expect(setCenter).toHaveBeenLastCalledWith(
      50,
      60,
      { zoom: 1, duration: 200 },
    );
  });
});
