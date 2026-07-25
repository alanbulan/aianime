// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  useCanvasPendingNodeFocus,
  type CanvasNodeFocusViewportPort,
} from './useCanvasPendingNodeFocus';

function canvasNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: 'node-1',
    type: CANVAS_NODE_TYPES.imageEdit,
    position: { x: 10, y: 20 },
    width: 300,
    height: 200,
    data: {},
    ...overrides,
  } as CanvasNode;
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
    const target = canvasNode({ measured: { width: 400, height: 240 } });
    const port = viewportPort({ x: 100, y: 200 }, 0.4);
    const clearPendingFocus = vi.fn();

    renderHook(() =>
      useCanvasPendingNodeFocus({
        pendingNodeId: target.id,
        nodes: [target],
        viewportPort: port,
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
    const target = canvasNode({
      type: CANVAS_NODE_TYPES.upload,
      width: undefined,
      height: undefined,
    });
    const port = viewportPort(null, 1.25);

    renderHook(() =>
      useCanvasPendingNodeFocus({
        pendingNodeId: target.id,
        nodes: [target],
        viewportPort: port,
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
        clearPendingFocus,
      }),
    );

    expect(port.centerAt).not.toHaveBeenCalled();
    expect(clearPendingFocus).not.toHaveBeenCalled();
  });
});
