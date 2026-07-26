// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  useCanvasLinkedCaptureDragController,
  type CanvasLinkedCaptureDragControllerOptions,
} from './useCanvasLinkedCaptureDragController';

function node(
  id: string,
  position: { x: number; y: number },
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position,
    data: {},
    ...overrides,
  } as CanvasNode;
}

function captureGraph() {
  const source = node('source', { x: 10, y: 20 });
  const secondSource = node('second-source', { x: 50, y: 60 });
  const group = node(
    'group',
    { x: 100, y: 200 },
    { type: CANVAS_NODE_TYPES.group },
  );
  const capture = node('capture', { x: 0, y: 0 }, {
    parentId: group.id,
    data: { captureMetadata: { yaw: 90 } },
  });
  return {
    nodes: [source, secondSource, group, capture],
    edges: [
      { id: 'edge-1', source: source.id, target: capture.id },
      { id: 'edge-2', source: secondSource.id, target: capture.id },
    ] as CanvasEdge[],
  };
}

function createOptions(): CanvasLinkedCaptureDragControllerOptions {
  const graph = captureGraph();
  return {
    getGraph: vi.fn(() => graph),
    commitNodePositions: vi.fn(),
  };
}

describe('useCanvasLinkedCaptureDragController', () => {
  it('moves the output group by the source-node drag delta', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasLinkedCaptureDragController(options),
    );

    act(() => {
      result.current.beginLinkedDrag(false, 'source', 1);
      result.current.updateLinkedDrag({ x: 30, y: 55 });
    });

    expect(options.commitNodePositions).toHaveBeenCalledWith([
      {
        nodeId: 'group',
        position: { x: 120, y: 235 },
        dragging: true,
      },
    ]);
  });

  it('moves every top-level source when dragging the capture output group', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasLinkedCaptureDragController(options),
    );

    act(() => {
      result.current.beginLinkedDrag(false, 'group', 1);
      result.current.updateLinkedDrag({ x: 130, y: 250 });
    });

    expect(options.commitNodePositions).toHaveBeenCalledWith([
      {
        nodeId: 'source',
        position: { x: 40, y: 70 },
        dragging: true,
      },
      {
        nodeId: 'second-source',
        position: { x: 80, y: 110 },
        dragging: true,
      },
    ]);
  });

  it('does not link Alt drags or multi-node drags', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasLinkedCaptureDragController(options),
    );

    act(() => {
      result.current.beginLinkedDrag(true, 'source', 1);
      result.current.updateLinkedDrag({ x: 20, y: 30 });
      result.current.beginLinkedDrag(false, 'source', 2);
      result.current.updateLinkedDrag({ x: 20, y: 30 });
    });

    expect(options.getGraph).not.toHaveBeenCalled();
    expect(options.commitNodePositions).not.toHaveBeenCalled();
  });

  it('clears partner movement when the drag finishes', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasLinkedCaptureDragController(options),
    );

    act(() => {
      result.current.beginLinkedDrag(false, 'source', 1);
      result.current.finishLinkedDrag();
      result.current.updateLinkedDrag({ x: 30, y: 55 });
    });

    expect(options.commitNodePositions).not.toHaveBeenCalled();
  });
});
