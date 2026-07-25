// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef } from 'react';

import { isImmersiveViewerActive } from '@/features/viewer-kit/useViewerImmersiveBody';

import { isSpacePanKey, isTypingTarget } from '../ui/canvasInteractionTargets';

export interface CanvasSpacePanController {
  isSpacePanActive: () => boolean;
}

export function useCanvasSpacePan(
  clearMarqueeSelection: () => void,
): CanvasSpacePanController {
  const spacePanActiveRef = useRef(false);

  const isSpacePanActive = useCallback(() => spacePanActiveRef.current, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !isSpacePanKey(event)
        || isTypingTarget(event.target)
        || isImmersiveViewerActive()
      ) {
        return;
      }
      spacePanActiveRef.current = true;
      clearMarqueeSelection();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isSpacePanKey(event)) {
        spacePanActiveRef.current = false;
      }
    };

    const handleBlur = () => {
      spacePanActiveRef.current = false;
      clearMarqueeSelection();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [clearMarqueeSelection]);

  return { isSpacePanActive };
}
