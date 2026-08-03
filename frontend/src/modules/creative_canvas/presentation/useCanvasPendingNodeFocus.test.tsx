// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasPendingNodeFocus,
  type CanvasFocusableNode,
  type CanvasNodeFocusViewportPort,
} from './useCanvasPendingNodeFocus';

function canvasNode(
  overrides: Partial<CanvasFocusableNode> = {},
): CanvasFocusableNode {
  return {
    id: 'node-1',
    position: { x: 10, y: 20 },
    ...overrides,
  };
}

function viewportPort(
  absolutePosition: { x: number; y: number } | null,
  zoom: number,
): CanvasNodeFocusViewportPort {
  return {
    getNodeAbsolutePosition: vi.fn(() => absolutePosition),
    getZoom: vi.fn(() => zoom),
    centerAt: vi.fn(),
  };
}

describe('useCanvasPendingNodeFocus', () => {
  it('centers a grouped node from its absolute position and clears the request', () => {
    const target = canvasNode();
    const port = viewportPort({ x: 100, y: 200 }, 0.4);
    const clearPendingFocus = vi.fn();

    renderHook(() =>
      useCanvasPendingNodeFocus({
        pendingNodeId: target.id,
        nodes: [target],
        viewportPort: port,
        resolveNodeSize: () => ({ width: 400, height: 240 }),
        clearPendingFocus,
      }),
    );

    expect(port.centerAt).toHaveBeenCalledWith(
      { x: 300, y: 320 },
      { zoom: 0.6, duration: 320 },
    );
    expect(clearPendingFocus).toHaveBeenCalledOnce();
  });

  it('falls back to the node position and shared domain size', () => {
    const target = canvasNode();
    const port = viewportPort(null, 1.25);

    renderHook(() =>
      useCanvasPendingNodeFocus({
        pendingNodeId: target.id,
        nodes: [target],
        viewportPort: port,
        resolveNodeSize: () => ({ width: 320, height: 350 }),
        clearPendingFocus: vi.fn(),
      }),
    );

    expect(port.centerAt).toHaveBeenCalledWith(
      { x: 170, y: 195 },
      { zoom: 1.25, duration: 320 },
    );
  });

  it('clears a request for a missing node without moving the viewport', () => {
    const port = viewportPort(null, 1);
    const clearPendingFocus = vi.fn();

    renderHook(() =>
      useCanvasPendingNodeFocus({
        pendingNodeId: 'missing-node',
        nodes: [],
        viewportPort: port,
        resolveNodeSize: vi.fn(),
        clearPendingFocus,
      }),
    );

    expect(port.centerAt).not.toHaveBeenCalled();
    expect(clearPendingFocus).toHaveBeenCalledOnce();
  });

  it('does nothing without a pending request', () => {
    const port = viewportPort(null, 1);
    const clearPendingFocus = vi.fn();

    renderHook(() =>
      useCanvasPendingNodeFocus({
        pendingNodeId: null,
        nodes: [canvasNode()],
        viewportPort: port,
        resolveNodeSize: vi.fn(),
        clearPendingFocus,
      }),
    );

    expect(port.centerAt).not.toHaveBeenCalled();
    expect(clearPendingFocus).not.toHaveBeenCalled();
  });
});
