// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CANVAS_NODE_TYPES } from '../domain/canvasNodes';
import type { CanvasConnectionMenuRequest } from '../ui/canvasConnectionInteraction';
import { useCanvasNodeMenuStateController } from './useCanvasNodeMenuStateController';

const connectionRequest: CanvasConnectionMenuRequest = {
  pending: {
    nodeId: 'source',
    handleType: 'source',
    start: { x: 10, y: 20 },
  },
  clientPosition: { x: 300, y: 400 },
  menuPosition: { x: 280, y: 360 },
  allowedTypes: [CANVAS_NODE_TYPES.video],
  preview: {
    line: {
      start: { x: 10, y: 20 },
      end: { x: 280, y: 360 },
      handleType: 'source',
    },
    containerSize: { width: 800, height: 600 },
  },
};

describe('useCanvasNodeMenuStateController', () => {
  it('opens a connection menu with its flow position and preview visual', () => {
    const { result } = renderHook(() => useCanvasNodeMenuStateController());

    act(() => result.current.openConnectionMenu(
      connectionRequest,
      { x: 120, y: 180 },
    ));

    expect(result.current.showNodeMenu).toBe(true);
    expect(result.current.pendingConnectStart).toBe(connectionRequest.pending);
    expect(result.current.flowPosition).toEqual({ x: 120, y: 180 });
    expect(result.current.menuPosition).toEqual({ x: 280, y: 360 });
    expect(result.current.menuAllowedTypes).toEqual([CANVAS_NODE_TYPES.video]);
    expect(result.current.previewConnectionVisual).toMatchObject({
      d: expect.stringContaining('M 10 20 C'),
      width: 800,
      height: 600,
      strokeLinecap: 'round',
    });
  });

  it('shares one reset transition across marquee, batch-drag and pane clicks', () => {
    const { result } = renderHook(() => useCanvasNodeMenuStateController());

    for (const reset of [
      () => result.current.handleMarqueeStart(),
      () => result.current.prepareBatchConnectionDrag(),
      () => result.current.dismissNodeMenuForPaneClick(),
    ]) {
      act(() => result.current.openConnectionMenu(
        connectionRequest,
        { x: 120, y: 180 },
      ));
      act(reset);

      expect(result.current.showNodeMenu).toBe(false);
      expect(result.current.menuAllowedTypes).toBeUndefined();
      expect(result.current.pendingConnectStart).toBeNull();
      expect(result.current.previewConnectionVisual).toBeNull();
    }
  });

  it('preserves batch context while hiding for placement and clears it on close', () => {
    const { result } = renderHook(() => useCanvasNodeMenuStateController());

    act(() => result.current.openBatchConnectionMenu({
      sourceIds: ['source-a', 'source-b'],
      allowedTypes: [CANVAS_NODE_TYPES.imageGen],
      spawnFlowPosition: { x: 50, y: 60 },
      menuPosition: { x: 70, y: 80 },
    }));
    act(() => result.current.hideNodeMenuForPlacement());

    expect(result.current.showNodeMenu).toBe(false);
    expect(result.current.menuAllowedTypes).toBeUndefined();
    expect(result.current.pendingBatchConnectIds).toEqual([
      'source-a',
      'source-b',
    ]);

    act(() => result.current.closeNodeMenu());
    expect(result.current.pendingBatchConnectIds).toBeNull();
  });

  it('opens a plain menu and dismisses connection state without batch cleanup', () => {
    const { result } = renderHook(() => useCanvasNodeMenuStateController());

    act(() => result.current.openPlainNodeMenu({
      flowPosition: { x: 15, y: 25 },
      menuPosition: { x: 35, y: 45 },
    }));

    expect(result.current.showNodeMenu).toBe(true);
    expect(result.current.flowPosition).toEqual({ x: 15, y: 25 });
    expect(result.current.menuPosition).toEqual({ x: 35, y: 45 });
    expect(result.current.pendingConnectStart).toBeNull();

    act(() => result.current.dismissNodeMenuForPaneClick());
    expect(result.current.showNodeMenu).toBe(false);
  });
});
