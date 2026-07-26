// Copyright (c) 2026 AI anime
import {
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import {
  DEFAULT_NODE_WIDTH,
  isStoryboardGroupNode,
  type CanvasNode,
} from '../domain/canvasNodes';

const DEFAULT_STORYBOARD_GROUP_HEIGHT = 240;
const STORYBOARD_FOCUS_OPTIONS = { zoom: 1, duration: 320 } as const;

export interface CanvasNodeClickControllerOptions {
  placementActive: boolean;
  commitPlacement: (position: { x: number; y: number }) => boolean;
  suppressNextPaneClick: () => void;
  centerViewport: (
    position: { x: number; y: number },
    options: { zoom: number; duration: number },
  ) => void;
}

export interface CanvasNodeClickController {
  handleNodeClick: (
    event: ReactMouseEvent,
    node: CanvasNode,
  ) => void;
}

export function useCanvasNodeClickController({
  placementActive,
  commitPlacement,
  suppressNextPaneClick,
  centerViewport,
}: CanvasNodeClickControllerOptions): CanvasNodeClickController {
  const handleNodeClick = useCallback(
    (event: ReactMouseEvent, node: CanvasNode) => {
      if (placementActive) {
        event.preventDefault();
        event.stopPropagation();
        if (commitPlacement({ x: event.clientX, y: event.clientY })) {
          suppressNextPaneClick();
        }
        return;
      }
      if (!isStoryboardGroupNode(node)) {
        return;
      }

      const width = node.measured?.width
        ?? (typeof node.width === 'number' ? node.width : DEFAULT_NODE_WIDTH);
      const height = node.measured?.height
        ?? (typeof node.height === 'number'
          ? node.height
          : DEFAULT_STORYBOARD_GROUP_HEIGHT);
      centerViewport(
        {
          x: node.position.x + width / 2,
          y: node.position.y + height / 2,
        },
        STORYBOARD_FOCUS_OPTIONS,
      );
    },
    [
      centerViewport,
      commitPlacement,
      placementActive,
      suppressNextPaneClick,
    ],
  );

  return { handleNodeClick };
}
