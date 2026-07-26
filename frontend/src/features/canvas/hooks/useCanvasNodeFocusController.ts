// Copyright (c) 2026 AI anime
import { useMemo } from 'react';

import type { CanvasNode } from '../domain/canvasNodes';
import {
  useCanvasPendingNodeFocus,
  type CanvasFocusPoint,
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

export interface CanvasNodeFocusControllerOptions {
  pendingNodeId: string | null;
  nodes: readonly CanvasNode[];
  runtimePort: CanvasNodeFocusRuntimePort;
  clearPendingFocus: () => void;
}

export interface CanvasNodeFocusController {
  centerViewport: CanvasNodeFocusViewportPort['centerAt'];
}

export function useCanvasNodeFocusController({
  pendingNodeId,
  nodes,
  runtimePort,
  clearPendingFocus,
}: CanvasNodeFocusControllerOptions): CanvasNodeFocusController {
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
    clearPendingFocus,
  });

  return { centerViewport: viewportPort.centerAt };
}
