// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  FinalConnectionState,
  OnConnectStartParams,
} from '@xyflow/react';

import {
  CANVAS_CONNECTION_NODE_TYPES as CANVAS_NODE_TYPES,
  type CanvasConnectionNodeLike as CanvasNode,
} from '../domain/canvasConnection';
import {
  useCanvasReactFlowConnectionController,
  type CanvasReactFlowConnectionControllerOptions,
} from './useCanvasReactFlowConnectionController';

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

function connectionHandle(
  nodeId: string,
  handleId: string,
  type: 'source' | 'target',
  rect: { left: number; top: number; width: number; height: number },
): HTMLDivElement {
  const element = flowElement(null, rect);
  element.className = `react-flow__handle react-flow__handle-${type} ${type}`;
  element.dataset.nodeid = nodeId;
  element.dataset.handleid = handleId;
  return element;
}

function createOptions(
  nodes: readonly CanvasNode[],
  wrapper: HTMLDivElement,
  pendingConnection: CanvasReactFlowConnectionControllerOptions['pendingConnection'] = null,
): CanvasReactFlowConnectionControllerOptions {
  return {
    wrapperRef: { current: wrapper },
    nodes,
    pendingConnection,
    prepareConnectionStart: vi.fn(),
    clearConnection: vi.fn(),
    openConnectionMenu: vi.fn(),
    connectNodes: vi.fn(),
  };
}

describe('useCanvasReactFlowConnectionController', () => {
  it('prepares a connection start resolved from the active handle', () => {
    const origin = canvasNode('origin', CANVAS_NODE_TYPES.upload);
    const wrapper = flowElement(null, {
      left: 10,
      top: 20,
      width: 500,
      height: 400,
    });
    const sourceHandle = connectionHandle(origin.id, 'source-main', 'source', {
      left: 100,
      top: 120,
      width: 10,
      height: 20,
    });
    const options = createOptions([origin], wrapper);
    const { result } = renderHook(() =>
      useCanvasReactFlowConnectionController(options));

    act(() => result.current.handleConnectStart(
      {
        clientX: 999,
        clientY: 999,
        target: sourceHandle,
      } as unknown as MouseEvent,
      {
        nodeId: origin.id,
        handleType: 'source',
        handleId: 'source-main',
      } as OnConnectStartParams,
    ));

    expect(options.prepareConnectionStart).toHaveBeenCalledWith({
      nodeId: origin.id,
      handleType: 'source',
      handleId: 'source-main',
      start: { x: 95, y: 110 },
    });
  });

  it('dispatches a resolved existing-node connection and clears the gesture', () => {
    const source = canvasNode('source', CANVAS_NODE_TYPES.upload);
    const target = canvasNode('target', CANVAS_NODE_TYPES.imageGen);
    const wrapper = flowElement(null, {
      left: 0,
      top: 0,
      width: 500,
      height: 400,
    });
    const targetElement = flowElement(target.id, {
      left: 100,
      top: 80,
      width: 200,
      height: 160,
    });
    const targetHandle = connectionHandle(target.id, 'target-main', 'target', {
      left: 96,
      top: 96,
      width: 8,
      height: 8,
    });
    targetElement.append(targetHandle);
    wrapper.append(targetElement);
    const options = createOptions([source, target], wrapper, {
      nodeId: source.id,
      handleType: 'source',
      handleId: 'source',
    });
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => targetHandle,
    });

    try {
      const { result } = renderHook(() =>
        useCanvasReactFlowConnectionController(options));
      act(() => result.current.handleConnectEnd(
        {
          clientX: 100,
          clientY: 100,
          target: targetHandle,
        } as unknown as MouseEvent,
        { isValid: false } as FinalConnectionState,
      ));

      expect(options.connectNodes).toHaveBeenCalledWith({
        source: source.id,
        target: target.id,
        sourceHandle: 'source',
        targetHandle: 'target-main',
      });
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

  it('opens the connection menu for an unresolved end', () => {
    const origin = canvasNode('origin', CANVAS_NODE_TYPES.video);
    const wrapper = flowElement(null, {
      left: 10,
      top: 20,
      width: 500,
      height: 400,
    });
    const pendingConnection = {
      nodeId: origin.id,
      handleType: 'source' as const,
      handleId: 'source',
    };
    const options = createOptions([origin], wrapper, pendingConnection);
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => null,
    });

    try {
      const { result } = renderHook(() =>
        useCanvasReactFlowConnectionController(options));
      act(() => result.current.handleConnectEnd(
        {
          clientX: 100,
          clientY: 120,
          target: null,
        } as unknown as MouseEvent,
        {
          isValid: false,
          from: { x: 5, y: 6 },
        } as FinalConnectionState,
      ));

      expect(options.openConnectionMenu).toHaveBeenCalledWith({
        pending: pendingConnection,
        clientPosition: { x: 100, y: 120 },
        menuPosition: { x: 90, y: 100 },
        allowedTypes: [
          CANVAS_NODE_TYPES.textAnnotation,
          CANVAS_NODE_TYPES.video,
          CANVAS_NODE_TYPES.videoCompose,
          CANVAS_NODE_TYPES.script,
        ],
        preview: {
          line: {
            start: { x: 5, y: 6 },
            end: { x: 90, y: 100 },
            handleType: 'source',
          },
          containerSize: { width: 500, height: 400 },
        },
      });
      expect(options.clearConnection).not.toHaveBeenCalled();
      expect(options.connectNodes).not.toHaveBeenCalled();
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });
});
