// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanvasAutoLayoutControllerOptions,
  CanvasNodeFocusControllerOptions,
  CanvasSnapAlignmentPort,
  CanvasViewportRuntimeControllerOptions,
} from '@/modules/creative_canvas/public';

import {
  useCanvasViewportSurfaceController,
  type CanvasViewportSurfaceControllerOptions,
} from './useCanvasViewportSurfaceController';

const controllerMocks = vi.hoisted(() => {
  const minimapController = {
    pinned: false,
    visible: true,
    setHovered: vi.fn(),
    togglePinned: vi.fn(),
  };
  const viewportRuntimeController = {
    initialViewport: { x: 10, y: 20, zoom: 1.25 },
    handleMove: vi.fn(),
    handleMoveEnd: vi.fn(),
    handleEdgeClick: vi.fn(),
  };
  const snapAlignmentController = {
    alignNodeChanges: vi.fn(({ changes }) => changes),
    clearSnapAlignment: vi.fn(),
  };
  const focusController = { centerViewport: vi.fn() };
  const autoLayoutController = { organizeCanvas: vi.fn() };
  const snapState = {
    enabled: true,
    setGuides: vi.fn(),
    clearGuides: vi.fn(),
  };
  const canvasState = {
    currentViewport: { x: 10, y: 20, zoom: 1.25 },
    viewportBookmarks: Array.from<null | { x: number; y: number; zoom: number }>(
      { length: 10 },
    ).fill(null),
    clearViewportBookmarks: vi.fn(),
    setViewportBookmark: vi.fn(),
  };

  return {
    minimapController,
    viewportRuntimeController,
    snapAlignmentController,
    focusController,
    autoLayoutController,
    snapState,
    canvasState,
    trackpadState: { enabled: true },
    isImmersiveViewerActive: vi.fn(() => false),
    useMinimapVisibility: vi.fn(() => minimapController),
    useViewportRuntime: vi.fn(
      (_options: CanvasViewportRuntimeControllerOptions) =>
        viewportRuntimeController,
    ),
    useLifecycle: vi.fn(),
    useSnapAlignment: vi.fn(
      (_port: CanvasSnapAlignmentPort<CanvasViewportSurfaceControllerOptions['nodes'][number]>) =>
        snapAlignmentController,
    ),
    useNodeFocus: vi.fn(
      (_options: CanvasNodeFocusControllerOptions) => focusController,
    ),
    useAutoLayout: vi.fn(
      (_options: CanvasAutoLayoutControllerOptions) => autoLayoutController,
    ),
  };
});

vi.mock('@/modules/creative_canvas/public', () => ({
  useCanvasAutoLayoutController: controllerMocks.useAutoLayout,
  useCanvasLifecycle: controllerMocks.useLifecycle,
  useCanvasMinimapVisibility: controllerMocks.useMinimapVisibility,
  useCanvasNodeFocusController: controllerMocks.useNodeFocus,
  useSnapAlignStore: {
    getState: () => controllerMocks.snapState,
  },
  useCanvasSnapAlignment: controllerMocks.useSnapAlignment,
  useCanvasViewportRuntimeController: controllerMocks.useViewportRuntime,
  useTrackpadPanStore: (
    selector: (state: { enabled: boolean }) => unknown,
  ) => selector(controllerMocks.trackpadState),
}));
vi.mock('@/features/canvas/canvasStore', () => ({
  useCanvasStore: {
    getState: () => controllerMocks.canvasState,
  },
}));
vi.mock('@/features/viewer-kit/useViewerImmersiveBody', () => ({
  isImmersiveViewerActive: controllerMocks.isImmersiveViewerActive,
}));
function createOptions(): CanvasViewportSurfaceControllerOptions {
  return {
    wrapperRef: { current: null },
    viewportPort: {
      fitView: vi.fn(() => Promise.resolve(true)),
    } as unknown as CanvasViewportSurfaceControllerOptions['viewportPort'],
    transformStore: {
      getState: () => ({ transform: [0, 0, 1] }),
      subscribe: vi.fn(() => vi.fn()),
    },
    commitViewport: vi.fn(),
    setViewportSize: vi.fn(),
    nodes: [],
    edges: [],
    pendingNodeId: null,
    clearPendingFocus: vi.fn(),
    setNodePositions: vi.fn(),
    isCanvasEmpty: vi.fn(() => false),
    closeImageViewer: vi.fn(),
  };
}

describe('useCanvasViewportSurfaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controllerMocks.trackpadState.enabled = true;
    controllerMocks.snapState.enabled = true;
  });

  it('assembles the viewport surface through each existing controller once', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasViewportSurfaceController(options),
    );

    expect(controllerMocks.useMinimapVisibility).toHaveBeenCalledOnce();
    expect(controllerMocks.useViewportRuntime).toHaveBeenCalledWith({
      wrapperRef: options.wrapperRef,
      viewportPort: options.viewportPort,
      transformStore: options.transformStore,
      bookmarkStore: expect.any(Object),
      commitViewport: options.commitViewport,
      setViewportSize: options.setViewportSize,
      isImmersiveViewerActive: controllerMocks.isImmersiveViewerActive,
    });
    expect(controllerMocks.useLifecycle).toHaveBeenCalledWith({
      wrapperRef: options.wrapperRef,
      isCanvasEmpty: options.isCanvasEmpty,
      setViewport: options.commitViewport,
      closeImageViewer: options.closeImageViewer,
    });
    expect(controllerMocks.useNodeFocus).toHaveBeenCalledWith({
      pendingNodeId: options.pendingNodeId,
      nodes: options.nodes,
      runtimePort: options.viewportPort,
      resolveNodeSize: expect.any(Function),
      clearPendingFocus: options.clearPendingFocus,
    });
    expect(controllerMocks.useAutoLayout).toHaveBeenCalledWith({
      nodes: options.nodes,
      edges: options.edges,
      setNodePositions: options.setNodePositions,
      fitViewport: expect.any(Function),
    });
    expect(result.current).toEqual(expect.objectContaining({
      ...controllerMocks.minimapController,
      ...controllerMocks.viewportRuntimeController,
      ...controllerMocks.snapAlignmentController,
      trackpadPanEnabled: true,
      centerNodeViewport: controllerMocks.focusController.centerViewport,
      organizeCanvas: controllerMocks.autoLayoutController.organizeCanvas,
    }));
  });

  it('owns the React Flow fit and snap-store adapters', () => {
    const options = createOptions();
    renderHook(() => useCanvasViewportSurfaceController(options));

    const autoLayoutOptions = controllerMocks.useAutoLayout.mock.calls[0][0];
    autoLayoutOptions.fitViewport({ duration: 240, padding: 0.2 });
    expect(options.viewportPort.fitView).toHaveBeenCalledWith({
      duration: 240,
      padding: 0.2,
    });

    const snapPort = controllerMocks.useSnapAlignment.mock.calls[0][0];
    const guides = { vertical: [], horizontal: [] };
    expect(snapPort.isEnabled()).toBe(true);
    snapPort.setGuides(guides);
    snapPort.clearGuides();
    expect(controllerMocks.snapState.setGuides).toHaveBeenCalledWith(guides);
    expect(controllerMocks.snapState.clearGuides).toHaveBeenCalledOnce();

    const bookmarkStore = controllerMocks.useViewportRuntime.mock.calls[0][0]
      .bookmarkStore;
    expect(bookmarkStore.getCurrentViewport()).toEqual(
      controllerMocks.canvasState.currentViewport,
    );
    bookmarkStore.clearBookmarks();
    bookmarkStore.setBookmark(2, { x: 30, y: 40, zoom: 1.5 });
    controllerMocks.canvasState.viewportBookmarks[2] = {
      x: 30,
      y: 40,
      zoom: 1.5,
    };
    expect(bookmarkStore.getBookmark(2)).toEqual({ x: 30, y: 40, zoom: 1.5 });
    expect(controllerMocks.canvasState.clearViewportBookmarks)
      .toHaveBeenCalledOnce();
    expect(controllerMocks.canvasState.setViewportBookmark)
      .toHaveBeenCalledWith(2, { x: 30, y: 40, zoom: 1.5 });
  });
});
