// Copyright (c) 2026 AI anime
import { useEffect } from 'react';

export interface CanvasFocusPoint {
  x: number;
  y: number;
}

export interface CanvasFocusableNode {
  id: string;
  position: CanvasFocusPoint;
}

export interface CanvasFocusNodeSize {
  width: number;
  height: number;
}

export interface CanvasNodeFocusViewportPort {
  getNodeAbsolutePosition: (nodeId: string) => CanvasFocusPoint | null;
  getZoom: () => number;
  centerAt: (
    position: CanvasFocusPoint,
    options: { zoom: number; duration: number },
  ) => void;
}

export interface CanvasPendingNodeFocusOptions<
  TNode extends CanvasFocusableNode = CanvasFocusableNode,
> {
  pendingNodeId: string | null;
  nodes: readonly TNode[];
  viewportPort: CanvasNodeFocusViewportPort;
  resolveNodeSize: (node: TNode) => CanvasFocusNodeSize;
  clearPendingFocus: () => void;
}

export function useCanvasPendingNodeFocus<
  TNode extends CanvasFocusableNode,
>({
  pendingNodeId,
  nodes,
  viewportPort,
  resolveNodeSize,
  clearPendingFocus,
}: CanvasPendingNodeFocusOptions<TNode>): void {
  useEffect(() => {
    if (!pendingNodeId) {
      return;
    }

    const target = nodes.find((node) => node.id === pendingNodeId);
    if (!target) {
      clearPendingFocus();
      return;
    }

    const size = resolveNodeSize(target);
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
  }, [clearPendingFocus, nodes, pendingNodeId, resolveNodeSize, viewportPort]);
}
