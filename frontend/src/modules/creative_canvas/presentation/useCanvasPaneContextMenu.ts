// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState, type RefObject } from 'react';

import { isCanvasPaneTarget } from './canvasInteractionTargets';

export interface CanvasPaneContextMenuCapabilities {
  canUndo: boolean;
  canRedo: boolean;
  canPaste: boolean;
}

export interface CanvasPaneContextMenuState
  extends CanvasPaneContextMenuCapabilities {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

export interface CanvasPaneContextMenuController {
  contextMenu: CanvasPaneContextMenuState | null;
  closeContextMenu: () => void;
}

export interface CanvasPaneContextMenuOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  getCapabilities: () => CanvasPaneContextMenuCapabilities;
}

export function useCanvasPaneContextMenu({
  wrapperRef,
  disabled,
  getCapabilities,
}: CanvasPaneContextMenuOptions): CanvasPaneContextMenuController {
  const [contextMenu, setContextMenu] =
    useState<CanvasPaneContextMenuState | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    const wrapperElement = wrapperRef.current;
    if (!wrapperElement) {
      return;
    }

    const handleContextMenu = (event: MouseEvent) => {
      if (!isCanvasPaneTarget(event.target, wrapperElement)) {
        return;
      }
      event.preventDefault();
      if (disabled) {
        return;
      }

      const containerRect = wrapperElement.getBoundingClientRect();
      setContextMenu({
        x: event.clientX - containerRect.left,
        y: event.clientY - containerRect.top,
        clientX: event.clientX,
        clientY: event.clientY,
        ...getCapabilities(),
      });
    };

    wrapperElement.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      wrapperElement.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [disabled, getCapabilities, wrapperRef]);

  return {
    contextMenu,
    closeContextMenu,
  };
}
