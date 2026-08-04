// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createUseCanvasConnectionGestureSurfaceController,
  type CanvasConnectionGestureSurfaceControllerOptions,
  type CanvasConnectionGestureSurfaceStore,
} from './useCanvasConnectionGestureSurfaceController';

const controllerMocks = vi.hoisted(() => {
  const setHoveredNodeId = vi.fn();
  const storeState = {
    hoveredNodeId: 'node-1' as string | null,
    setHoveredNodeId,
  };
  const hover = {
    clearHoveredNodeTimer: vi.fn(),
    scheduleHoveredNodeClear: vi.fn(),
    handleNodeMouseEnter: vi.fn(),
    handleNodeMouseLeave: vi.fn(),
  };
  const gestures = {
    isPlusConnectDragging: false,
    handlePlusOpenMenu: vi.fn(),
    handleConnectStart: vi.fn(),
  };
  return {
    setHoveredNodeId,
    storeState,
    hover,
    gestures,
    useNodeHover: vi.fn(() => hover),
    useConnectionGestures: vi.fn(() => gestures),
  };
});

vi.mock('./useCanvasConnectionGestureController', () => ({
  useCanvasConnectionGestureController:
    controllerMocks.useConnectionGestures,
}));
vi.mock('./useCanvasNodeHover', () => ({
  useCanvasNodeHover: controllerMocks.useNodeHover,
}));

const useStore = <TSelected,>(
  selector: (state: CanvasConnectionGestureSurfaceStore) => TSelected,
): TSelected => selector(controllerMocks.storeState);

const useCanvasConnectionGestureSurfaceController =
  createUseCanvasConnectionGestureSurfaceController({ useStore });

function createOptions(): CanvasConnectionGestureSurfaceControllerOptions {
  return {
    wrapperRef: { current: document.createElement('div') },
    nodes: [],
    screenToFlowPosition: vi.fn((position) => position),
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

describe('createUseCanvasConnectionGestureSurfaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controllerMocks.storeState.hoveredNodeId = 'node-1';
  });

  it('shares the hover timer and setter with connection gestures', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasConnectionGestureSurfaceController(options),
    );

    expect(controllerMocks.useNodeHover).toHaveBeenCalledWith(
      controllerMocks.setHoveredNodeId,
    );
    expect(controllerMocks.useConnectionGestures).toHaveBeenCalledWith({
      ...options,
      clearHoveredNodeTimer: controllerMocks.hover.clearHoveredNodeTimer,
      setHoveredNodeId: controllerMocks.setHoveredNodeId,
    });
    expect(result.current).toEqual({
      hoveredNodeId: 'node-1',
      ...controllerMocks.hover,
      ...controllerMocks.gestures,
    });
  });

  it('keeps the hover setter inside the gesture surface', () => {
    controllerMocks.storeState.hoveredNodeId = null;
    const { result } = renderHook(() =>
      useCanvasConnectionGestureSurfaceController(createOptions()),
    );

    expect(result.current.hoveredNodeId).toBeNull();
    expect(result.current).not.toHaveProperty('setHoveredNodeId');
  });
});
