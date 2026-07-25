// Copyright (c) 2026 AI anime
import { useEffect } from 'react';

import { getNodeSize } from '../domain/canvasGeometry';
import type { CanvasNode } from '../domain/canvasNodes';

export interface CanvasFocusPoint {
  x: number;
  y: number;
}

export interface CanvasNodeFocusViewportPort {
  getNodeAbsolutePosition: (nodeId: string) => CanvasFocusPoint | null;
  getZoom: () => number;
  centerAt: (
    position: CanvasFocusPoint,
    options: { zoom: number; duration: number },
  ) => void;
}

export interface CanvasPendingNodeFocusOptions {
  pendingNodeId: string | null;
  nodes: readonly CanvasNode[];
  viewportPort: CanvasNodeFocusViewportPort;
  clearPendingFocus: () => void;
}

export function useCanvasPendingNodeFocus({
  pendingNodeId,
  nodes,
  viewportPort,
  clearPendingFocus,
}: CanvasPendingNodeFocusOptions): void {
  useEffect(() => {
    if (!pendingNodeId) {
      return;
    }

    const target = nodes.find((node) => node.id === pendingNodeId);
    if (!target) {
      clearPendingFocus();
      return;
    }

    const size = getNodeSize(target);
    const position = viewportPort.getNodeAbsolutePosition(pendingNodeId)
      ?? target.position;
    viewportPort.centerAt(
      {
        x: position.x + size.width / 2,
        y: position.y + size.height / 2,
      },
      {
        zoom: Math.max(viewportPort.getZoom(), 0.6),
        duration: 320,
      },
    );
    clearPendingFocus();
  }, [clearPendingFocus, nodes, pendingNodeId, viewportPort]);
}
