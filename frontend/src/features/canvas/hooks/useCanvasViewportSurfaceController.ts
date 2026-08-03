// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import { isImmersiveViewerActive } from '@/features/viewer-kit/useViewerImmersiveBody';
import {
  getNodeSize,
  useCanvasMinimapVisibility,
  useCanvasLifecycle,
  useCanvasAutoLayoutController,
  useCanvasNodeFocusController,
  useCanvasSnapAlignment,
  useCanvasViewportRuntimeController,
  useSnapAlignStore,
  useTrackpadPanStore,
  type CanvasAutoLayoutController,
  type CanvasAutoLayoutControllerOptions,
  type CanvasAutoLayoutViewportOptions,
  type CanvasLifecycleOptions,
  type CanvasMinimapVisibilityController,
  type CanvasNodeFocusController,
  type CanvasNodeFocusControllerOptions,
  type CanvasNodeFocusRuntimePort,
  type CanvasSnapAlignmentController,
  type CanvasSnapAlignmentPort,
  type CanvasViewportBookmarkStorePort,
  type CanvasViewportPort,
  type CanvasViewportRuntimeController,
  type CanvasViewportRuntimeControllerOptions,
} from '@/modules/creative_canvas/public';
const CANVAS_SNAP_ALIGNMENT_PORT: CanvasSnapAlignmentPort<CanvasNode> = {
  isEnabled: () => useSnapAlignStore.getState().enabled,
  isExcludedNode: (node) => node.type === CANVAS_NODE_TYPES.group,
  setGuides: (guides) => useSnapAlignStore.getState().setGuides(guides),
  clearGuides: () => useSnapAlignStore.getState().clearGuides(),
};

const CANVAS_VIEWPORT_BOOKMARK_STORE_PORT: CanvasViewportBookmarkStorePort = {
  getCurrentViewport: () => useCanvasStore.getState().currentViewport,
  clearBookmarks: () => useCanvasStore.getState().clearViewportBookmarks(),
  setBookmark: (index, bookmark) => {
    useCanvasStore.getState().setViewportBookmark(index, bookmark);
  },
  getBookmark: (index) => useCanvasStore.getState().viewportBookmarks[index],
};

export interface CanvasViewportSurfacePort
  extends CanvasViewportPort,
    CanvasNodeFocusRuntimePort {
  fitView: (options: CanvasAutoLayoutViewportOptions) => unknown;
}

export interface CanvasViewportSurfaceControllerOptions {
  wrapperRef: CanvasViewportRuntimeControllerOptions['wrapperRef'];
  viewportPort: CanvasViewportSurfacePort;
  transformStore: CanvasViewportRuntimeControllerOptions['transformStore'];
  commitViewport: CanvasViewportRuntimeControllerOptions['commitViewport'];
  setViewportSize: CanvasViewportRuntimeControllerOptions['setViewportSize'];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  pendingNodeId: CanvasNodeFocusControllerOptions<CanvasNode>['pendingNodeId'];
  clearPendingFocus: CanvasNodeFocusControllerOptions<CanvasNode>['clearPendingFocus'];
  setNodePositions: CanvasAutoLayoutControllerOptions['setNodePositions'];
  isCanvasEmpty: CanvasLifecycleOptions['isCanvasEmpty'];
  closeImageViewer: CanvasLifecycleOptions['closeImageViewer'];
}

export interface CanvasViewportSurfaceController
  extends CanvasViewportRuntimeController,
    CanvasMinimapVisibilityController,
    CanvasSnapAlignmentController<CanvasNode> {
  trackpadPanEnabled: boolean;
  centerNodeViewport: CanvasNodeFocusController['centerViewport'];
  organizeCanvas: CanvasAutoLayoutController['organizeCanvas'];
}

export function useCanvasViewportSurfaceController({
  wrapperRef,
  viewportPort,
  transformStore,
  commitViewport,
  setViewportSize,
  nodes,
  edges,
  pendingNodeId,
  clearPendingFocus,
  setNodePositions,
  isCanvasEmpty,
  closeImageViewer,
}: CanvasViewportSurfaceControllerOptions): CanvasViewportSurfaceController {
  const minimap = useCanvasMinimapVisibility({ isImmersiveViewerActive });
  const trackpadPanEnabled = useTrackpadPanStore((state) => state.enabled);
  const viewportRuntime = useCanvasViewportRuntimeController({
    wrapperRef,
    viewportPort,
    transformStore,
    bookmarkStore: CANVAS_VIEWPORT_BOOKMARK_STORE_PORT,
    commitViewport,
    setViewportSize,
    isImmersiveViewerActive,
  });
  useCanvasLifecycle({
    wrapperRef,
    isCanvasEmpty,
    setViewport: commitViewport,
    closeImageViewer,
  });
  const snapAlignment = useCanvasSnapAlignment(CANVAS_SNAP_ALIGNMENT_PORT);
  const { centerViewport: centerNodeViewport } = useCanvasNodeFocusController({
    pendingNodeId,
    nodes,
    runtimePort: viewportPort,
    resolveNodeSize: getNodeSize,
    clearPendingFocus,
  });
  const fitAutoLayoutViewport = useCallback(
    (options: CanvasAutoLayoutViewportOptions) => {
      void viewportPort.fitView(options);
    },
    [viewportPort],
  );
  const { organizeCanvas } = useCanvasAutoLayoutController({
    nodes,
    edges,
    setNodePositions,
    fitViewport: fitAutoLayoutViewport,
  });

  return {
    ...minimap,
    ...viewportRuntime,
    ...snapAlignment,
    trackpadPanEnabled,
    centerNodeViewport,
    organizeCanvas,
  };
}
