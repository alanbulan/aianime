// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CANVAS_NODE_TYPES, type CanvasNode } from '../domain/canvasNodes';
import {
  createPreviewPath,
  cssEscape,
  getClientPosition,
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
  element.className = `react-flow__handle ${type}`;
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

  it('builds stable forward and reverse preview curves', () => {
    expect(createPreviewPath({
      start: { x: 0, y: 0 },
      end: { x: 100, y: 50 },
      handleType: 'source',
    })).toBe('M 0 0 C 40 0, 60 50, 100 50');
    expect(createPreviewPath({
      start: { x: 0, y: 0 },
      end: { x: -100, y: 50 },
      handleType: 'source',
    })).toBe('M 0 0 C -40 0, -60 50, -100 50');
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
});
