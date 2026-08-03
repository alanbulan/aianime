// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef } from "react";

import { isSpacePanKey, isTypingTarget } from "./canvasInteractionTargets";

export interface CanvasSpacePanOptions {
  clearMarqueeSelection: () => void;
  isImmersiveViewerActive: () => boolean;
}

export interface CanvasSpacePanController {
  isSpacePanActive: () => boolean;
}

export function useCanvasSpacePan({
  clearMarqueeSelection,
  isImmersiveViewerActive,
}: CanvasSpacePanOptions): CanvasSpacePanController {
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

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, [clearMarqueeSelection, isImmersiveViewerActive]);

  return { isSpacePanActive };
}
