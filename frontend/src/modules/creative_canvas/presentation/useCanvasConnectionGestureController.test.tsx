// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_CONNECTION_NODE_TYPES as CANVAS_NODE_TYPES,
} from '../domain/canvasConnection';
import type {
  CanvasBatchConnectionNode as CanvasNode,
} from '../domain/canvasBatchConnection';
import {
  useCanvasConnectionGestureController,
  type CanvasConnectionGestureControllerOptions,
} from './useCanvasConnectionGestureController';

function canvasNode(
  id: string,
  type: CanvasNode['type'],
  selected = false,
): CanvasNode {
  return {
    id,
    type,
    selected,
    position: { x: 0, y: 0 },
    measured: { width: 80, height: 60 },
    data: {},
  } as CanvasNode;
}

function flowElement(
  id: string | null,
  rect: { left: number; top: number; width: number; height: number },
): HTMLDivElement {
  const element = document.createElement('div');
  if (id) {
    element.className = 'react-flow__node';
    element.dataset.id = id;
  }
  element.getBoundingClientRect = () => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
  return element;
}

function createOptions(
  nodes: readonly CanvasNode[],
  wrapper: HTMLDivElement,
): CanvasConnectionGestureControllerOptions {
  return {
    wrapperRef: { current: wrapper },
    nodes,
    screenToFlowPosition: vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 })),
    clearHoveredNodeTimer: vi.fn(),
    setHoveredNodeId: vi.fn(),
    pendingConnection: null,
    prepareConnectionStart: vi.fn(),
    prepareBatchConnectionDrag: vi.fn(),
    clearConnection: vi.fn(),
    updateConnectionPreview: vi.fn(),
    openConnectionMenuState: vi.fn(),
    openBatchConnectionMenuState: vi.fn(),
    suppressNextPaneClick: vi.fn(),
    connectNodes: vi.fn(),
  };
}

describe('useCanvasConnectionGestureController', () => {
  it('adapts plus-menu coordinates and pane-click suppression once', () => {
    const origin = canvasNode('origin', CANVAS_NODE_TYPES.upload);
    const wrapper = flowElement(null, {
      left: 10,
      top: 20,
      width: 500,
      height: 400,
    });
    wrapper.append(flowElement(origin.id, {
      left: 20,
      top: 30,
      width: 60,
      height: 60,
    }));
    const options = createOptions([origin], wrapper);
    const { result } = renderHook(() =>
      useCanvasConnectionGestureController(options),
    );

    act(() => result.current.handlePlusOpenMenu({
      nodeId: origin.id,
      handleType: 'source',
      clientPosition: { x: 90, y: 70 },
    }));

    expect(options.openConnectionMenuState).toHaveBeenCalledWith(
      expect.objectContaining({
        pending: expect.objectContaining({ nodeId: origin.id }),
        clientPosition: { x: 90, y: 70 },
      }),
      { x: 45, y: 35 },
    );
    expect(options.suppressNextPaneClick).toHaveBeenCalledOnce();
  });

  it('routes batch menus through the same pane-click suppression', () => {
    const nodes = [
      canvasNode('upload', CANVAS_NODE_TYPES.upload, true),
      canvasNode('video', CANVAS_NODE_TYPES.video, true),
    ];
    nodes[1]!.position = { x: 120, y: 0 };
    const wrapper = flowElement(null, {
      left: 10,
      top: 20,
      width: 500,
      height: 400,
    });
    const options = createOptions(nodes, wrapper);
    const { result } = renderHook(() =>
      useCanvasConnectionGestureController(options),
    );

    act(() => result.current.handleBatchConnectOpenMenu({
      clientPosition: { x: 330, y: 220 },
    }));

    expect(options.openBatchConnectionMenuState).toHaveBeenCalledWith(
      expect.objectContaining({ sourceIds: ['upload', 'video'] }),
    );
    expect(options.suppressNextPaneClick).toHaveBeenCalledOnce();
  });
});
