// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from 'react';

import { isImmersiveViewerActive } from '@/features/viewer-kit/useViewerImmersiveBody';

import { isTypingTarget } from '@/modules/creative_canvas/public';

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
  }, [togglePinned]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  return {
    pinned,
    visible: pinned || hovered,
    setHovered,
    togglePinned,
  };
}
