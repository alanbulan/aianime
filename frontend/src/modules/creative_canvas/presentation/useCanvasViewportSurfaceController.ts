// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import { isImmersiveViewerActive } from '@/features/viewer-kit/public';
import type { CanvasViewportPort } from '../application/bookmarkActions';
import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodeData';
import type { ViewportBookmark } from '../domain/viewportBookmarks';
import { getNodeSize } from '../domain/canvasGeometry';
import {
  useCanvasAutoLayoutController,
  type CanvasAutoLayoutController,
  type CanvasAutoLayoutControllerOptions,
  type CanvasAutoLayoutViewportOptions,
} from './useCanvasAutoLayoutController';
import { useCanvasLifecycle, type CanvasLifecycleOptions } from './useCanvasLifecycle';
import { useCanvasMinimapVisibility, type CanvasMinimapVisibilityController } from './useCanvasMinimapVisibility';
import {
  useCanvasNodeFocusController,
  type CanvasNodeFocusController,
  type CanvasNodeFocusControllerOptions,
  type CanvasNodeFocusRuntimePort,
} from './useCanvasNodeFocusController';
import {
  useCanvasSnapAlignment,
  type CanvasSnapAlignmentController,
  type CanvasSnapAlignmentPort,
} from './useCanvasSnapAlignment';
import {
  useCanvasViewportRuntimeController,
  type CanvasViewportRuntimeController,
  type CanvasViewportRuntimeControllerOptions,
  type CanvasViewportBookmarkStorePort,
} from './useCanvasViewportRuntimeController';
import { useSnapAlignStore } from './snapAlignStore';
import { useTrackpadPanStore } from './trackpadPanStore';

export interface CanvasViewportSurfaceStore {
  currentViewport: ViewportBookmark;
  viewportBookmarks: readonly (ViewportBookmark | null)[];
  clearViewportBookmarks: () => void;
  setViewportBookmark: (index: number, bookmark: ViewportBookmark) => void;
}

export type CanvasViewportSurfaceStoreHook = {
  <TSelected>(
    selector: (state: CanvasViewportSurfaceStore) => TSelected,
  ): TSelected;
  getState: () => CanvasViewportSurfaceStore;
};

const CANVAS_SNAP_ALIGNMENT_PORT: CanvasSnapAlignmentPort<CanvasNode> = {
  isEnabled: () => useSnapAlignStore.getState().enabled,
  isExcludedNode: (node) => node.type === CANVAS_NODE_TYPES.group,
  setGuides: (guides) => useSnapAlignStore.getState().setGuides(guides),
  clearGuides: () => useSnapAlignStore.getState().clearGuides(),
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

export function createUseCanvasViewportSurfaceController({
  useCanvasStore,
}: {
  useCanvasStore: CanvasViewportSurfaceStoreHook;
}) {
  const CANVAS_VIEWPORT_BOOKMARK_STORE_PORT: CanvasViewportBookmarkStorePort = {
    getCurrentViewport: () => useCanvasStore.getState().currentViewport,
    clearBookmarks: () => useCanvasStore.getState().clearViewportBookmarks(),
    setBookmark: (index, bookmark) => {
      useCanvasStore.getState().setViewportBookmark(index, bookmark);
    },
    getBookmark: (index) => useCanvasStore.getState().viewportBookmarks[index],
  };

  return function useCanvasViewportSurfaceController({
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
  };
}
