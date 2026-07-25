// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from 'react';

const MINIMAP_HIDE_DELAY_MS = 180;

export interface CanvasMinimapVisibilityController {
  pinned: boolean;
  visible: boolean;
  setHovered: (hovered: boolean) => void;
  togglePinned: () => void;
}

export function useCanvasMinimapVisibility(): CanvasMinimapVisibilityController {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHoveredState] = useState(false);
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

  useEffect(() => clearHideTimer, [clearHideTimer]);

  return {
    pinned,
    visible: pinned || hovered,
    setHovered,
    togglePinned,
  };
}
