// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPreviewPath,
  cssEscape,
  getClientPosition,
  resolveConnectEndHandleId,
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
});
