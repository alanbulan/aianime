// Copyright (c) 2026 AI anime
import { useMemo } from 'react';

import {
  useCanvasPendingNodeFocus,
  type CanvasFocusableNode,
  type CanvasFocusPoint,
  type CanvasPendingNodeFocusOptions,
  type CanvasNodeFocusViewportPort,
} from './useCanvasPendingNodeFocus';

export interface CanvasNodeFocusRuntimePort {
  getInternalNode: (nodeId: string) => {
    internals: { positionAbsolute: CanvasFocusPoint };
  } | undefined;
  getZoom: () => number;
  setCenter: (
    x: number,
    y: number,
    options: { zoom: number; duration: number },
  ) => unknown;
}

export interface CanvasNodeFocusControllerOptions<
  TNode extends CanvasFocusableNode = CanvasFocusableNode,
> {
  pendingNodeId: string | null;
  nodes: readonly TNode[];
  runtimePort: CanvasNodeFocusRuntimePort;
  resolveNodeSize: CanvasPendingNodeFocusOptions<TNode>['resolveNodeSize'];
  clearPendingFocus: () => void;
}

export interface CanvasNodeFocusController {
  centerViewport: CanvasNodeFocusViewportPort['centerAt'];
}

const NEW_NODE_AUTO_FOCUS_ZOOM_THRESHOLD = 0.35;

export function shouldFocusNewCanvasNode(zoom: number): boolean {
  return Number.isFinite(zoom) && zoom < NEW_NODE_AUTO_FOCUS_ZOOM_THRESHOLD;
}

export function useCanvasNodeFocusController<
  TNode extends CanvasFocusableNode,
>({
  pendingNodeId,
  nodes,
  runtimePort,
  resolveNodeSize,
  clearPendingFocus,
}: CanvasNodeFocusControllerOptions<TNode>): CanvasNodeFocusController {
  const viewportPort = useMemo<CanvasNodeFocusViewportPort>(
    () => ({
      getNodeAbsolutePosition: (nodeId) =>
        runtimePort.getInternalNode(nodeId)?.internals.positionAbsolute ?? null,
      getZoom: runtimePort.getZoom,
      centerAt: (position, options) => {
        void runtimePort.setCenter(position.x, position.y, options);
      },
    }),
    [runtimePort],
  );
  useCanvasPendingNodeFocus({
    pendingNodeId,
    nodes,
    viewportPort,
    resolveNodeSize,
    clearPendingFocus,
  });

  return { centerViewport: viewportPort.centerAt };
}
