// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from 'react';

import { isTypingTarget } from './canvasInteractionTargets';

const MINIMAP_HIDE_DELAY_MS = 180;

export interface CanvasMinimapVisibilityOptions {
  isImmersiveViewerActive: () => boolean;
}

export interface CanvasMinimapVisibilityController {
  pinned: boolean;
  visible: boolean;
  setHovered: (hovered: boolean) => void;
  startPanning: () => void;
  endPanning: (pointerInsideMinimap: boolean) => void;
  togglePinned: () => void;
}

export function useCanvasMinimapVisibility({
  isImmersiveViewerActive,
}: CanvasMinimapVisibilityOptions): CanvasMinimapVisibilityController {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHoveredState] = useState(false);
  const [panning, setPanning] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const setHovered = useCallback((nextHovered: boolean) => {
    clearHideTimer();
    if (nextHovered) {
      setHoveredState(true);
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      setHoveredState(false);
      hideTimerRef.current = null;
    }, MINIMAP_HIDE_DELAY_MS);
  }, [clearHideTimer]);

  const togglePinned = useCallback(() => {
    setPinned((current) => !current);
  }, []);

  const startPanning = useCallback(() => {
    clearHideTimer();
    setPanning(true);
  }, [clearHideTimer]);

  const endPanning = useCallback((pointerInsideMinimap: boolean) => {
    setPanning(false);
    setHovered(pointerInsideMinimap);
  }, [setHovered]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || event.altKey
        || event.key.toLowerCase() !== 'm'
        || isTypingTarget(event.target)
        || isImmersiveViewerActive()
      ) {
        return;
      }
      event.preventDefault();
      togglePinned();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImmersiveViewerActive, togglePinned]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  return {
    pinned,
    visible: pinned || hovered || panning,
    setHovered,
    startPanning,
    endPanning,
    togglePinned,
  };
}
