// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import type { CanvasViewportPort } from '../application/bookmarkActions';
import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import { useTrackpadPanStore } from '../trackpad-pan/trackpadPanStore';
import {
  useCanvasSnapAlignment,
  useSnapAlignStore,
  type CanvasSnapAlignmentController,
  type CanvasSnapAlignmentPort,
} from '@/modules/creative_canvas/public';
import {
  useCanvasAutoLayoutController,
  type CanvasAutoLayoutController,
  type CanvasAutoLayoutControllerOptions,
  type CanvasAutoLayoutViewportOptions,
} from './useCanvasAutoLayoutController';
import {
  useCanvasLifecycle,
  type CanvasLifecycleOptions,
} from './useCanvasLifecycle';
import {
  useCanvasMinimapVisibility,
  type CanvasMinimapVisibilityController,
} from './useCanvasMinimapVisibility';
import {
  useCanvasNodeFocusController,
  type CanvasNodeFocusController,
  type CanvasNodeFocusControllerOptions,
  type CanvasNodeFocusRuntimePort,
} from './useCanvasNodeFocusController';
import {
  useCanvasViewportRuntimeController,
  type CanvasViewportRuntimeController,
  type CanvasViewportRuntimeControllerOptions,
} from './useCanvasViewportRuntimeController';

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
  pendingNodeId: CanvasNodeFocusControllerOptions['pendingNodeId'];
  clearPendingFocus: CanvasNodeFocusControllerOptions['clearPendingFocus'];
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
  const minimap = useCanvasMinimapVisibility();
  const trackpadPanEnabled = useTrackpadPanStore((state) => state.enabled);
  const viewportRuntime = useCanvasViewportRuntimeController({
    wrapperRef,
    viewportPort,
    transformStore,
    commitViewport,
    setViewportSize,
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
