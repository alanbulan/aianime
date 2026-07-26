// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
} from '../domain/canvasNodes';
import {
  useCanvasBatchConnectionController,
  type CanvasBatchConnectionControllerOptions,
} from './useCanvasBatchConnectionController';

function canvasNode(
  id: string,
  type: CanvasNodeType,
  options: {
    selected?: boolean;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
  } = {},
): CanvasNode {
  return {
    id,
    type,
    selected: options.selected,
    position: options.position ?? { x: 0, y: 0 },
    measured: options.size,
    data: {},
  } as CanvasNode;
}

function wrapperElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({
    left: 10,
    top: 20,
    width: 500,
    height: 400,
    right: 510,
    bottom: 420,
    x: 10,
    y: 20,
    toJSON: () => ({}),
  });
  return element;
}

function createSources(): CanvasNode[] {
  return [
    canvasNode('upload', CANVAS_NODE_TYPES.upload, {
      selected: true,
      position: { x: 10, y: 20 },
      size: { width: 100, height: 50 },
    }),
    canvasNode('video', CANVAS_NODE_TYPES.video, {
      selected: true,
      position: { x: 200, y: 100 },
      size: { width: 80, height: 120 },
    }),
  ];
}

function createOptions(
  nodes: readonly CanvasNode[],
  wrapper: HTMLDivElement,
): CanvasBatchConnectionControllerOptions {
  return {
    wrapperRef: { current: wrapper },
    nodes,
    screenToFlowPosition: vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 })),
    beginConnectionDrag: vi.fn(),
    endConnectionDrag: vi.fn(),
    prepareConnectionDrag: vi.fn(),
    updateConnectionPreview: vi.fn(),
    openConnectionMenu: vi.fn(),
    connectNodes: vi.fn(),
  };
}

describe('useCanvasBatchConnectionController', () => {
  it('opens the batch menu from the selected source bounds', () => {
    const nodes = createSources();
    const options = createOptions(nodes, wrapperElement());
    const { result } = renderHook(() =>
      useCanvasBatchConnectionController(options));

    act(() => result.current.handleBatchConnectOpenMenu({
      clientPosition: { x: 330, y: 220 },
    }));

    expect(options.updateConnectionPreview).toHaveBeenCalledWith(null);
    expect(options.openConnectionMenu).toHaveBeenCalledWith({
      sourceIds: ['upload', 'video'],
      allowedTypes: [
        CANVAS_NODE_TYPES.textAnnotation,
        CANVAS_NODE_TYPES.video,
        CANVAS_NODE_TYPES.script,
      ],
      spawnFlowPosition: { x: 420, y: -40 },
      menuPosition: { x: 320, y: 200 },
    });
  });

  it('fans eligible sources into an existing drop target in source order', () => {
    const sources = createSources();
    const target = canvasNode('target', CANVAS_NODE_TYPES.textAnnotation);
    const nodes = [...sources, target];
    const wrapper = wrapperElement();
    const targetElement = document.createElement('div');
    targetElement.className = 'react-flow__node';
    targetElement.dataset.id = target.id;
    wrapper.append(targetElement);
    const options = createOptions(nodes, wrapper);
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => targetElement,
    });

    try {
      const { result } = renderHook(() =>
        useCanvasBatchConnectionController(options));

      act(() => result.current.handleBatchConnectDragStart({
        clientPosition: { x: 290, y: 140 },
      }));
      expect(options.beginConnectionDrag).toHaveBeenCalledOnce();
      expect(options.prepareConnectionDrag).toHaveBeenCalledOnce();

      act(() => result.current.handleBatchConnectDragMove({
        clientPosition: { x: 320, y: 160 },
      }));
      expect(options.updateConnectionPreview).toHaveBeenCalledWith({
        line: {
          start: { x: 280, y: 120 },
          end: { x: 310, y: 140 },
          handleType: 'source',
        },
        containerSize: { width: 500, height: 400 },
      });

      act(() => result.current.handleBatchConnectDragEnd({
        clientPosition: { x: 320, y: 160 },
      }));
      expect(options.endConnectionDrag).toHaveBeenCalledOnce();
      expect(options.connectNodes).toHaveBeenNthCalledWith(1, {
        source: 'upload',
        target: target.id,
        sourceHandle: 'source',
        targetHandle: 'target',
      });
      expect(options.connectNodes).toHaveBeenNthCalledWith(2, {
        source: 'video',
        target: target.id,
        sourceHandle: 'source',
        targetHandle: 'target',
      });
      expect(options.openConnectionMenu).not.toHaveBeenCalled();
      expect(options.updateConnectionPreview).toHaveBeenLastCalledWith(null);
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('opens the batch menu at the dropped canvas position', () => {
    const nodes = createSources();
    const wrapper = wrapperElement();
    const options = createOptions(nodes, wrapper);
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => null,
    });

    try {
      const { result } = renderHook(() =>
        useCanvasBatchConnectionController(options));
      act(() => result.current.handleBatchConnectDragStart({
        clientPosition: { x: 290, y: 140 },
      }));
      act(() => result.current.handleBatchConnectDragEnd({
        clientPosition: { x: 400, y: 300 },
      }));

      expect(options.screenToFlowPosition).toHaveBeenCalledWith({ x: 400, y: 300 });
      expect(options.openConnectionMenu).toHaveBeenCalledWith({
        sourceIds: ['upload', 'video'],
        allowedTypes: [
          CANVAS_NODE_TYPES.textAnnotation,
          CANVAS_NODE_TYPES.video,
          CANVAS_NODE_TYPES.script,
        ],
        spawnFlowPosition: { x: 200, y: 150 },
        menuPosition: { x: 390, y: 280 },
      });
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('consumes a valid target even when no selected source can connect', () => {
    const firstVideo = canvasNode('video-1', CANVAS_NODE_TYPES.video, {
      selected: true,
      size: { width: 100, height: 80 },
    });
    const secondVideo = canvasNode('video-2', CANVAS_NODE_TYPES.video, {
      selected: true,
      position: { x: 120, y: 0 },
      size: { width: 100, height: 80 },
    });
    const target = canvasNode('audio', CANVAS_NODE_TYPES.audio);
    const wrapper = wrapperElement();
    const targetElement = document.createElement('div');
    targetElement.className = 'react-flow__node';
    targetElement.dataset.id = target.id;
    wrapper.append(targetElement);
    const options = createOptions([firstVideo, secondVideo, target], wrapper);
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => targetElement,
    });

    try {
      const { result } = renderHook(() =>
        useCanvasBatchConnectionController(options));
      act(() => result.current.handleBatchConnectDragStart({
        clientPosition: { x: 230, y: 60 },
      }));
      act(() => result.current.handleBatchConnectDragEnd({
        clientPosition: { x: 320, y: 160 },
      }));

      expect(options.connectNodes).not.toHaveBeenCalled();
      expect(options.openConnectionMenu).not.toHaveBeenCalled();
      expect(options.updateConnectionPreview).toHaveBeenLastCalledWith(null);
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });
});
