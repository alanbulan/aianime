// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CANVAS_NODE_TYPES, type CanvasNode } from '../domain/canvasNodes';
import {
  useCanvasPlusConnectionController,
  type CanvasPlusConnectionControllerOptions,
} from './useCanvasPlusConnectionController';

function canvasNode(id: string, type: CanvasNode['type']): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as CanvasNode;
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
): CanvasPlusConnectionControllerOptions {
  return {
    wrapperRef: { current: wrapper },
    nodes,
    clearHoveredNodeTimer: vi.fn(),
    clearHoveredNode: vi.fn(),
    prepareConnectionDrag: vi.fn(),
    clearConnection: vi.fn(),
    updateConnectionPreview: vi.fn(),
    openConnectionMenu: vi.fn(),
    connectNodes: vi.fn(),
  };
}

describe('useCanvasPlusConnectionController', () => {
  it('opens the node menu from the resolved plus anchor', () => {
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
      useCanvasPlusConnectionController(options));

    act(() => result.current.handlePlusOpenMenu({
      nodeId: origin.id,
      handleType: 'source',
      clientPosition: { x: 90, y: 70 },
    }));

    expect(options.openConnectionMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        pending: {
          nodeId: origin.id,
          handleType: 'source',
          start: { x: 70, y: 40 },
        },
        clientPosition: { x: 90, y: 70 },
        menuPosition: { x: 80, y: 50 },
        allowedTypes: expect.arrayContaining([
          CANVAS_NODE_TYPES.textAnnotation,
          CANVAS_NODE_TYPES.imageGen,
          CANVAS_NODE_TYPES.video,
        ]),
        preview: null,
      }),
    );
    expect(options.prepareConnectionDrag).not.toHaveBeenCalled();
  });

  it('owns drag state, preview, target highlight and connection dispatch', () => {
    const origin = canvasNode('origin', CANVAS_NODE_TYPES.upload);
    const target = canvasNode('target', CANVAS_NODE_TYPES.imageGen);
    const wrapper = flowElement(null, {
      left: 0,
      top: 0,
      width: 500,
      height: 400,
    });
    const originElement = flowElement(origin.id, {
      left: 0,
      top: 0,
      width: 80,
      height: 80,
    });
    const targetElement = flowElement(target.id, {
      left: 100,
      top: 0,
      width: 100,
      height: 100,
    });
    wrapper.append(originElement, targetElement);
    const options = createOptions([origin, target], wrapper);
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => targetElement,
    });

    try {
      const { result } = renderHook(() =>
        useCanvasPlusConnectionController(options));
      const startParams = {
        nodeId: origin.id,
        handleType: 'source' as const,
        clientPosition: { x: 80, y: 40 },
      };

      act(() => result.current.handlePlusConnectDragStart(startParams));
      expect(result.current.isPlusConnectDragging).toBe(true);
      expect(options.clearHoveredNodeTimer).toHaveBeenCalledOnce();
      expect(options.clearHoveredNode).toHaveBeenCalledOnce();
      expect(options.prepareConnectionDrag).toHaveBeenCalledWith({
        nodeId: origin.id,
        handleType: 'source',
        start: { x: 80, y: 40 },
      });

      act(() => result.current.handlePlusConnectDragMove({
        ...startParams,
        clientPosition: { x: 120, y: 40 },
      }));
      expect(options.updateConnectionPreview).toHaveBeenCalledWith({
        line: {
          start: { x: 80, y: 40 },
          end: { x: 120, y: 40 },
          handleType: 'source',
        },
        containerSize: { width: 500, height: 400 },
      });
      expect(targetElement).toHaveClass('canvas-node-drop-target');

      act(() => result.current.handlePlusConnectDragEnd({
        ...startParams,
        clientPosition: { x: 120, y: 40 },
      }));
      expect(result.current.isPlusConnectDragging).toBe(false);
      expect(targetElement).not.toHaveClass('canvas-node-drop-target');
      expect(options.connectNodes).toHaveBeenCalledWith(
        expect.objectContaining({
          source: origin.id,
          target: target.id,
          sourceHandle: 'source',
          targetHandle: 'target',
        }),
      );
      expect(options.clearConnection).toHaveBeenCalledOnce();
      expect(options.openConnectionMenu).not.toHaveBeenCalled();
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });
});
