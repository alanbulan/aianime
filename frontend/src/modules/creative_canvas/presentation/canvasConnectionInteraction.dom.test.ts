// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CANVAS_CONNECTION_NODE_TYPES as CANVAS_NODE_TYPES,
  type CanvasConnectionNodeLike as CanvasNode,
} from '../domain/canvasConnection';
import {
  cssEscape,
  getClientPosition,
  resolveCanvasConnectionEnd,
  resolveCanvasConnectionStart,
  resolveCanvasPlusConnectionEnd,
  resolveCanvasPlusConnectionStart,
  resolveConnectEndHandleId,
  resolveManualDropTargetElement,
} from './canvasConnectionInteraction';

afterEach(() => {
  vi.unstubAllGlobals();
});

function handle(
  nodeId: string,
  handleId: string,
  type: 'source' | 'target',
  rect: { left: number; top: number; width: number; height: number },
): HTMLElement {
  const element = document.createElement('div');
  element.className = `react-flow__handle react-flow__handle-${type} ${type}`;
  element.dataset.nodeid = nodeId;
  element.dataset.handleid = handleId;
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

function canvasNode(id: string, type: CanvasNode['type']): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as CanvasNode;
}

function flowNode(
  id: string,
  rect: { left: number; top: number; width: number; height: number },
): HTMLElement {
  const element = document.createElement('div');
  element.className = 'react-flow__node';
  element.dataset.id = id;
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

describe('Canvas connection interaction', () => {
  it('normalizes mouse and touch client positions', () => {
    expect(
      getClientPosition({ clientX: 10, clientY: 20 } as MouseEvent),
    ).toEqual({ x: 10, y: 20 });
    expect(
      getClientPosition({
        changedTouches: [{ clientX: 30, clientY: 40 }],
        touches: [],
      } as unknown as TouchEvent),
    ).toEqual({ x: 30, y: 40 });
    expect(
      getClientPosition({ changedTouches: [], touches: [] } as unknown as TouchEvent),
    ).toBeNull();
  });

  it('rejects incomplete and missing-node manual connection starts', () => {
    const group = canvasNode('group', CANVAS_NODE_TYPES.group);
    const event = { clientX: 10, clientY: 20, target: null } as unknown as MouseEvent;

    expect(resolveCanvasConnectionStart({
      event,
      params: { nodeId: null, handleType: 'source' },
      nodes: [group],
      containerRect: { left: 0, top: 0 },
    })).toBeNull();
    expect(resolveCanvasConnectionStart({
      event,
      params: { nodeId: 'missing', handleType: 'source' },
      nodes: [group],
      containerRect: { left: 0, top: 0 },
    })).toBeNull();
  });

  it('resolves a connection start from the handle center or event position', () => {
    const origin = canvasNode('origin', CANVAS_NODE_TYPES.upload);
    const sourceHandle = handle(origin.id, 'source', 'source', {
      left: 120,
      top: 230,
      width: 10,
      height: 20,
    });

    expect(resolveCanvasConnectionStart({
      event: {
        clientX: 999,
        clientY: 999,
        target: sourceHandle,
      } as unknown as MouseEvent,
      params: {
        nodeId: origin.id,
        handleType: 'source',
        handleId: 'source',
      },
      nodes: [origin],
      containerRect: { left: 100, top: 200 },
    })).toEqual({
      nodeId: origin.id,
      handleType: 'source',
      handleId: 'source',
      start: { x: 25, y: 40 },
    });
    expect(resolveCanvasConnectionStart({
      event: {
        clientX: 150,
        clientY: 260,
        target: null,
      } as unknown as MouseEvent,
      params: {
        nodeId: origin.id,
        handleType: 'target',
        handleId: null,
      },
      nodes: [origin],
      containerRect: { left: 100, top: 200 },
    })).toEqual({
      nodeId: origin.id,
      handleType: 'target',
      handleId: null,
      start: { x: 50, y: 60 },
    });
  });

  it('resolves a plus connection anchor and its allowed spawn types', () => {
    const origin = canvasNode('origin', CANVAS_NODE_TYPES.upload);
    const wrapper = flowNode('wrapper', {
      left: 10,
      top: 20,
      width: 500,
      height: 400,
    });
    const originElement = flowNode(origin.id, {
      left: 100,
      top: 80,
      width: 200,
      height: 120,
    });
    const sourceHandle = handle(origin.id, 'source', 'source', {
      left: 296,
      top: 126,
      width: 8,
      height: 8,
    });
    originElement.append(sourceHandle);
    wrapper.append(originElement);

    const resolution = resolveCanvasPlusConnectionStart({
      params: {
        nodeId: origin.id,
        handleType: 'source',
        clientPosition: { x: 320, y: 140 },
      },
      nodes: [origin],
      wrapperElement: wrapper,
    });

    expect(resolution).toMatchObject({
      pending: {
        nodeId: origin.id,
        handleType: 'source',
        start: { x: 290, y: 110 },
      },
      menuPosition: { x: 310, y: 120 },
    });
    expect(resolution?.allowedTypes).toHaveLength(6);
    expect(resolution?.allowedTypes).toEqual(expect.arrayContaining([
      CANVAS_NODE_TYPES.textAnnotation,
      CANVAS_NODE_TYPES.imageGen,
      CANVAS_NODE_TYPES.video,
      CANVAS_NODE_TYPES.script,
      CANVAS_NODE_TYPES.pano360Viewer,
      CANVAS_NODE_TYPES.threeDWorld,
    ]));
  });

  it('resolves a manual connection end with the exact handle under the pointer', () => {
    const source = canvasNode('source', CANVAS_NODE_TYPES.upload);
    const target = canvasNode('target', CANVAS_NODE_TYPES.imageGen);
    const wrapper = flowNode('wrapper', {
      left: 0,
      top: 0,
      width: 500,
      height: 400,
    });
    const targetElement = flowNode(target.id, {
      left: 100,
      top: 80,
      width: 200,
      height: 160,
    });
    const targetHandle = handle(target.id, 'target-specific', 'target', {
      left: 96,
      top: 96,
      width: 8,
      height: 8,
    });
    targetElement.append(targetHandle);
    wrapper.append(targetElement);
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => targetHandle,
    });

    try {
      expect(resolveCanvasConnectionEnd({
        event: {
          clientX: 100,
          clientY: 100,
          target: targetHandle,
        } as unknown as MouseEvent,
        connectionState: { isValid: false },
        pending: {
          nodeId: source.id,
          handleType: 'source',
          handleId: 'source',
        },
        nodes: [source, target],
        wrapperElement: wrapper,
      })).toEqual({
        kind: 'connect',
        source: source.id,
        target: target.id,
        sourceHandle: 'source',
        targetHandle: 'target-specific',
      });
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('plans the fallback menu and preview for an unresolved connection end', () => {
    const origin = canvasNode('origin', CANVAS_NODE_TYPES.video);
    const wrapper = flowNode('wrapper', {
      left: 10,
      top: 20,
      width: 500,
      height: 400,
    });
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => null,
    });

    try {
      const resolution = resolveCanvasConnectionEnd({
        event: {
          clientX: 100,
          clientY: 120,
          target: null,
        } as unknown as MouseEvent,
        connectionState: { isValid: false, from: { x: 5, y: 6 } },
        pending: {
          nodeId: origin.id,
          handleType: 'source',
          handleId: 'source',
        },
        nodes: [origin],
        wrapperElement: wrapper,
      });

      expect(resolution).toMatchObject({
        kind: 'open_menu',
        clientPosition: { x: 100, y: 120 },
        menuPosition: { x: 90, y: 100 },
        previewLine: {
          start: { x: 5, y: 6 },
          end: { x: 90, y: 100 },
          handleType: 'source',
        },
        containerSize: { width: 500, height: 400 },
      });
      expect(resolution.kind === 'open_menu' ? resolution.allowedTypes : []).toEqual([
        CANVAS_NODE_TYPES.textAnnotation,
        CANVAS_NODE_TYPES.video,
        CANVAS_NODE_TYPES.videoCompose,
        CANVAS_NODE_TYPES.script,
      ]);
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('cancels an already valid end and an empty target-side menu', () => {
    const world = canvasNode('world', CANVAS_NODE_TYPES.threeDWorld);
    const event = { clientX: 10, clientY: 20, target: null } as unknown as MouseEvent;
    const wrapper = flowNode('wrapper', {
      left: 0,
      top: 0,
      width: 500,
      height: 400,
    });
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => null,
    });

    try {
      expect(resolveCanvasConnectionEnd({
        event,
        connectionState: { isValid: true },
        pending: { nodeId: world.id, handleType: 'target' },
        nodes: [world],
        wrapperElement: wrapper,
      })).toEqual({ kind: 'cancel' });
      expect(resolveCanvasConnectionEnd({
        event,
        connectionState: { isValid: false },
        pending: { nodeId: world.id, handleType: 'target' },
        nodes: [world],
        wrapperElement: wrapper,
      })).toEqual({ kind: 'cancel' });
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('uses the platform CSS escape implementation or the local fallback', () => {
    vi.stubGlobal('CSS', { escape: (value: string) => `escaped:${value}` });
    expect(cssEscape('node"id')).toBe('escaped:node"id');
    vi.stubGlobal('CSS', undefined);
    expect(cssEscape('node"id\\tail')).toBe('node\\"id\\\\tail');
  });

  it('resolves a handle directly from the event target', () => {
    const targetHandle = handle('node', 'target-main', 'target', {
      left: 0,
      top: 0,
      width: 10,
      height: 10,
    });
    const child = document.createElement('span');
    targetHandle.append(child);

    expect(resolveConnectEndHandleId({
      eventTarget: child,
      nodeElement: null,
      nodeId: 'node',
      handleType: 'target',
      clientPosition: { x: 5, y: 5 },
    })).toBe('target-main');
  });

  it('falls back to the nearest visible matching handle', () => {
    const nodeElement = document.createElement('div');
    const far = handle('node', 'far', 'target', {
      left: 20,
      top: 20,
      width: 10,
      height: 10,
    });
    const near = handle('node', 'near', 'target', {
      left: 5,
      top: 5,
      width: 10,
      height: 10,
    });
    const hidden = handle('node', 'hidden', 'target', {
      left: 0,
      top: 0,
      width: 10,
      height: 10,
    });
    hidden.classList.add('opacity-0');
    nodeElement.append(far, near, hidden);
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => null,
    });

    try {
      expect(resolveConnectEndHandleId({
        eventTarget: null,
        nodeElement,
        nodeId: 'node',
        handleType: 'target',
        clientPosition: { x: 5, y: 5 },
      })).toBe('near');
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('prefers a valid node directly under the manual connection pointer', () => {
    const origin = canvasNode('origin', CANVAS_NODE_TYPES.upload);
    const target = canvasNode('target', CANVAS_NODE_TYPES.imageGen);
    const targetElement = flowNode(target.id, {
      left: 500,
      top: 500,
      width: 100,
      height: 100,
    });
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => targetElement,
    });

    try {
      expect(resolveManualDropTargetElement({
        clientPosition: { x: 10, y: 20 },
        pending: { nodeId: origin.id, handleType: 'source' },
        nodes: [origin, target],
        wrapperElement: null,
      })).toBe(targetElement);
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('chooses the nearest eligible node inside the manual drop neighborhood', () => {
    const origin = canvasNode('origin', CANVAS_NODE_TYPES.upload);
    const invalid = canvasNode('invalid', CANVAS_NODE_TYPES.audio);
    const near = canvasNode('near', CANVAS_NODE_TYPES.imageGen);
    const far = canvasNode('far', CANVAS_NODE_TYPES.video);
    const wrapper = document.createElement('div');
    wrapper.append(
      flowNode(origin.id, { left: 0, top: 0, width: 10, height: 10 }),
      flowNode(invalid.id, { left: 15, top: 0, width: 10, height: 10 }),
      flowNode(near.id, { left: 30, top: 0, width: 10, height: 10 }),
      flowNode(far.id, { left: 50, top: 0, width: 10, height: 10 }),
    );
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => null,
    });

    try {
      expect(resolveManualDropTargetElement({
        clientPosition: { x: 10, y: 5 },
        pending: { nodeId: origin.id, handleType: 'source' },
        nodes: [origin, invalid, near, far],
        wrapperElement: wrapper,
        maxDistance: 50,
      })?.dataset.id).toBe(near.id);
      expect(resolveManualDropTargetElement({
        clientPosition: { x: 10, y: 5 },
        pending: { nodeId: origin.id, handleType: 'source' },
        nodes: [origin, invalid, near, far],
        wrapperElement: wrapper,
        maxDistance: 5,
      })).toBeNull();
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });

  it('resolves a plus drag end through the same manual drop neighborhood', () => {
    const origin = canvasNode('origin', CANVAS_NODE_TYPES.upload);
    const target = canvasNode('target', CANVAS_NODE_TYPES.imageGen);
    const wrapper = flowNode('wrapper', {
      left: 0,
      top: 0,
      width: 500,
      height: 400,
    });
    wrapper.append(
      flowNode(origin.id, { left: 0, top: 0, width: 10, height: 10 }),
      flowNode(target.id, { left: 30, top: 0, width: 100, height: 100 }),
    );
    const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => null,
    });

    try {
      expect(resolveCanvasPlusConnectionEnd({
        clientPosition: { x: 10, y: 5 },
        pending: {
          nodeId: origin.id,
          handleType: 'source',
          start: { x: 10, y: 5 },
        },
        nodes: [origin, target],
        wrapperElement: wrapper,
      })).toEqual({
        kind: 'connect',
        source: origin.id,
        target: target.id,
        sourceHandle: 'source',
        targetHandle: 'target',
      });
    } finally {
      if (original) {
        Object.defineProperty(document, 'elementFromPoint', original);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }
  });
});
