// Copyright (c) 2026 AI anime
import {
  useCanvasConnectionGestureController,
  type CanvasConnectionGestureController,
  type CanvasConnectionGestureControllerOptions,
} from './useCanvasConnectionGestureController';
import {
  useCanvasNodeHover,
  type CanvasNodeHoverController,
} from './useCanvasNodeHover';

export interface CanvasConnectionGestureSurfaceStore {
  hoveredNodeId: string | null;
  setHoveredNodeId: (nodeId: string | null) => void;
}

export type CanvasConnectionGestureSurfaceStoreHook = <TSelected>(
  selector: (state: CanvasConnectionGestureSurfaceStore) => TSelected,
) => TSelected;

export interface CanvasConnectionGestureSurfaceControllerDependencies {
  useStore: CanvasConnectionGestureSurfaceStoreHook;
}

export type CanvasConnectionGestureSurfaceControllerOptions = Omit<
  CanvasConnectionGestureControllerOptions,
  'clearHoveredNodeTimer' | 'setHoveredNodeId'
>;

export type CanvasConnectionGestureSurfaceController =
  CanvasNodeHoverController &
    CanvasConnectionGestureController & {
      hoveredNodeId: string | null;
    };

export function createUseCanvasConnectionGestureSurfaceController({
  useStore,
}: CanvasConnectionGestureSurfaceControllerDependencies) {
  return function useCanvasConnectionGestureSurfaceController(
    options: CanvasConnectionGestureSurfaceControllerOptions,
  ): CanvasConnectionGestureSurfaceController {
    const hoveredNodeId = useStore((state) => state.hoveredNodeId);
    const setHoveredNodeId = useStore((state) => state.setHoveredNodeId);
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
  };
}
