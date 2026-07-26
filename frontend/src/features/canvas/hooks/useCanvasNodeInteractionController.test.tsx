// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CANVAS_NODE_TYPES } from '../domain/canvasNodes';
import {
  useCanvasNodeInteractionController,
  type CanvasNodeInteractionControllerOptions,
} from './useCanvasNodeInteractionController';

function wrapperElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({
    left: 10,
    top: 20,
    width: 400,
    height: 300,
    right: 410,
    bottom: 320,
    x: 10,
    y: 20,
    toJSON: () => ({}),
  });
  return element;
}

function createOptions(): CanvasNodeInteractionControllerOptions {
  return {
    wrapperRef: { current: wrapperElement() },
    nodes: [],
    screenToFlowPosition: vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 })),
    createNode: vi.fn(() => 'node-1'),
    selectNode: vi.fn(),
    bindSkill: vi.fn(),
    confirmPlacement: vi.fn(),
    resolvePlacementLabel: vi.fn(({ type }) => type),
    openPlainNodeMenu: vi.fn(),
    dismissNodeMenu: vi.fn(),
    centerViewport: vi.fn(),
    flowPosition: { x: 0, y: 0 },
    menuPosition: { x: 0, y: 0 },
    menuAllowedTypes: undefined,
    pendingConnection: null,
    pendingBatchSourceIds: null,
    connectSpawnedNode: vi.fn(),
    hideMenuForPlacement: vi.fn(),
    closeNodeMenu: vi.fn(),
  };
}

describe('useCanvasNodeInteractionController', () => {
  it('shares one client-to-flow adapter when opening the node menu', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasNodeInteractionController(options),
    );

    act(() => result.current.openNodeMenuAtClientPosition({ x: 110, y: 120 }));

    expect(options.openPlainNodeMenu).toHaveBeenCalledWith({
      flowPosition: { x: 55, y: 60 },
      menuPosition: { x: 100, y: 100 },
    });
    expect(options.selectNode).toHaveBeenCalledWith(null);
  });

  it('routes quick add through the same node factory and viewport center', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasNodeInteractionController(options),
    );

    act(() => result.current.quickAddNode(CANVAS_NODE_TYPES.upload));

    expect(options.createNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.upload,
      { x: 105, y: 85 },
    );
    expect(options.selectNode).toHaveBeenCalledWith('node-1');
  });
});
