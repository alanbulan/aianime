// Copyright (c) 2026 AI anime
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  useCanvasNodeHover,
  type CanvasNodeHoverController,
} from '@/modules/creative_canvas/public';

import {
  useCanvasConnectionGestureController,
  type CanvasConnectionGestureController,
  type CanvasConnectionGestureControllerOptions,
} from './useCanvasConnectionGestureController';

export type CanvasConnectionGestureSurfaceControllerOptions = Omit<
  CanvasConnectionGestureControllerOptions,
  'clearHoveredNodeTimer' | 'setHoveredNodeId'
>;

export type CanvasConnectionGestureSurfaceController =
  CanvasNodeHoverController &
  CanvasConnectionGestureController & {
    hoveredNodeId: string | null;
  };

export function useCanvasConnectionGestureSurfaceController(
  options: CanvasConnectionGestureSurfaceControllerOptions,
): CanvasConnectionGestureSurfaceController {
  const hoveredNodeId = useCanvasStore((state) => state.hoveredNodeId);
  const setHoveredNodeId = useCanvasStore((state) => state.setHoveredNodeId);
  const hover = useCanvasNodeHover(setHoveredNodeId);
  const gestures = useCanvasConnectionGestureController({
    ...options,
    clearHoveredNodeTimer: hover.clearHoveredNodeTimer,
    setHoveredNodeId,
  });

  return {
    hoveredNodeId,
    ...hover,
    ...gestures,
  };
}
