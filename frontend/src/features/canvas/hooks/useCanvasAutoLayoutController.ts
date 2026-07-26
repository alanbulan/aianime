// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import { computeAutoLayout } from '../application/autoLayout';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';

const AUTO_LAYOUT_VIEWPORT_OPTIONS = {
  duration: 240,
  padding: 0.2,
} as const;

export interface CanvasAutoLayoutViewportOptions {
  duration: number;
  padding: number;
}

export interface CanvasAutoLayoutControllerOptions {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  setNodePositions: (
    positions: Record<string, { x: number; y: number }>,
  ) => void;
  fitViewport: (options: CanvasAutoLayoutViewportOptions) => void;
  scheduleAfterLayout?: (callback: () => void) => void;
}

export interface CanvasAutoLayoutController {
  organizeCanvas: () => void;
}

function scheduleAfterBrowserLayout(callback: () => void): void {
  window.requestAnimationFrame(callback);
}

export function useCanvasAutoLayoutController({
  nodes,
  edges,
  setNodePositions,
  fitViewport,
  scheduleAfterLayout = scheduleAfterBrowserLayout,
}: CanvasAutoLayoutControllerOptions): CanvasAutoLayoutController {
  const organizeCanvas = useCallback(() => {
    const { positions, changedCount } = computeAutoLayout(nodes, edges);
    if (Object.keys(positions).length === 0) {
      return;
    }
    if (changedCount > 0) {
      setNodePositions(positions);
    }
    scheduleAfterLayout(() => fitViewport(AUTO_LAYOUT_VIEWPORT_OPTIONS));
  }, [edges, fitViewport, nodes, scheduleAfterLayout, setNodePositions]);

  return { organizeCanvas };
}
