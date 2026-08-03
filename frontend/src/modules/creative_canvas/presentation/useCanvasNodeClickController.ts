// Copyright (c) 2026 AI anime
import {
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import type { CanvasFocusableNode } from './useCanvasPendingNodeFocus';
import { DEFAULT_CANVAS_NODE_WIDTH } from '../domain/canvasGeometry';

const DEFAULT_STORYBOARD_GROUP_HEIGHT = 240;
const STORYBOARD_FOCUS_OPTIONS = { zoom: 1, duration: 320 } as const;

export interface CanvasNodeClickTarget extends CanvasFocusableNode {
  width?: number;
  height?: number;
  measured?: {
    width?: number;
    height?: number;
  };
}

export interface CanvasNodeClickControllerOptions<
  TNode extends CanvasNodeClickTarget = CanvasNodeClickTarget,
> {
  placementActive: boolean;
  commitPlacement: (position: { x: number; y: number }) => boolean;
  suppressNextPaneClick: () => void;
  centerViewport: (
    position: { x: number; y: number },
    options: { zoom: number; duration: number },
  ) => void;
  isStoryboardGroupNode: (node: TNode) => boolean;
}

export interface CanvasNodeClickController<
  TNode extends CanvasNodeClickTarget = CanvasNodeClickTarget,
> {
  handleNodeClick: (
    event: ReactMouseEvent,
    node: TNode,
  ) => void;
}

export function useCanvasNodeClickController<
  TNode extends CanvasNodeClickTarget,
>({
  placementActive,
  commitPlacement,
  suppressNextPaneClick,
  centerViewport,
  isStoryboardGroupNode,
}: CanvasNodeClickControllerOptions<TNode>): CanvasNodeClickController<TNode> {
  const handleNodeClick = useCallback(
    (event: ReactMouseEvent, node: TNode) => {
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
        ?? node.width
        ?? DEFAULT_CANVAS_NODE_WIDTH;
      const height = node.measured?.height
        ?? node.height
        ?? DEFAULT_STORYBOARD_GROUP_HEIGHT;
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
      isStoryboardGroupNode,
      placementActive,
      suppressNextPaneClick,
    ],
  );

  return { handleNodeClick };
}
