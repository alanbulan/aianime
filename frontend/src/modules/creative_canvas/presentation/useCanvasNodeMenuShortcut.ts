// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

import {
  isCanvasPaneTarget,
  isTypingTarget,
} from './canvasInteractionTargets';

export interface CanvasClientPosition {
  x: number;
  y: number;
}

export interface CanvasNodeMenuShortcutOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  placementActive: boolean;
  setPlacementClientPosition: (position: CanvasClientPosition) => void;
  openNodeMenu: (position: CanvasClientPosition) => void;
  isImmersiveViewerActive: () => boolean;
}

export interface CanvasNodeMenuShortcutController {
  handleCanvasPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  getLastCanvasPointerPosition: () => CanvasClientPosition | null;
  getPreferredCanvasPointerPosition: () => CanvasClientPosition | null;
}

export function useCanvasNodeMenuShortcut({
  wrapperRef,
  placementActive,
  setPlacementClientPosition,
  openNodeMenu,
  isImmersiveViewerActive,
}: CanvasNodeMenuShortcutOptions): CanvasNodeMenuShortcutController {
  const lastPointerPositionRef = useRef<CanvasClientPosition | null>(null);

  const getLastCanvasPointerPosition = useCallback(
    () => lastPointerPositionRef.current,
    [],
  );

  const getPreferredCanvasPointerPosition = useCallback(() => {
    const lastPointerPosition = lastPointerPositionRef.current;
    if (lastPointerPosition) {
      return lastPointerPosition;
    }
    const wrapperElement = wrapperRef.current;
    const fallbackRect = wrapperElement
      ?.querySelector<HTMLElement>('.react-flow__pane')
      ?.getBoundingClientRect()
      ?? wrapperElement?.getBoundingClientRect();
    return fallbackRect
      ? {
          x: fallbackRect.left + fallbackRect.width / 2,
          y: fallbackRect.top + fallbackRect.height / 2,
        }
      : null;
  }, [wrapperRef]);

  const handleCanvasPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const wrapperElement = wrapperRef.current;
      if (!wrapperElement) {
        return;
      }

      if (placementActive) {
        const rect = wrapperElement.getBoundingClientRect();
        if (
          event.clientX >= rect.left
          && event.clientX <= rect.right
          && event.clientY >= rect.top
          && event.clientY <= rect.bottom
        ) {
          const position = { x: event.clientX, y: event.clientY };
          lastPointerPositionRef.current = position;
          setPlacementClientPosition(position);
        }
        return;
      }

      if (isCanvasPaneTarget(event.target, wrapperElement)) {
        lastPointerPositionRef.current = {
          x: event.clientX,
          y: event.clientY,
        };
      }
    },
    [placementActive, setPlacementClientPosition, wrapperRef],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.isComposing
        || event.metaKey
        || event.ctrlKey
        || event.altKey
        || event.shiftKey
        || event.key !== 'Tab'
        || isTypingTarget(event.target)
        || isImmersiveViewerActive()
      ) {
        return;
      }

      const position = getPreferredCanvasPointerPosition();
      if (!position) {
        return;
      }
      event.preventDefault();
      openNodeMenu(position);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    getPreferredCanvasPointerPosition,
    isImmersiveViewerActive,
    openNodeMenu,
  ]);

  return {
    handleCanvasPointerMove,
    getLastCanvasPointerPosition,
    getPreferredCanvasPointerPosition,
  };
}
