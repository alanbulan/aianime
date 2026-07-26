// Copyright (c) 2026 AI anime
import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from 'react';

export interface CanvasPaneClickControllerOptions {
  placementActive: boolean;
  commitPlacement: (position: { x: number; y: number }) => boolean;
  openNodeMenu: (position: { x: number; y: number }) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  dismissNodeMenu: () => void;
  onBlankPaneClick?: () => void;
}

export interface CanvasPaneClickController {
  handlePaneClick: (event: ReactMouseEvent) => void;
  suppressNextPaneClick: () => void;
  releasePaneClickSuppression: () => void;
}

export function useCanvasPaneClickController({
  placementActive,
  commitPlacement,
  openNodeMenu,
  setSelectedNodeId,
  dismissNodeMenu,
  onBlankPaneClick,
}: CanvasPaneClickControllerOptions): CanvasPaneClickController {
  const paneClickSuppressedRef = useRef(false);

  const suppressNextPaneClick = useCallback(() => {
    paneClickSuppressedRef.current = true;
  }, []);

  const releasePaneClickSuppression = useCallback(() => {
    paneClickSuppressedRef.current = false;
  }, []);

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent) => {
      if (placementActive) {
        if (commitPlacement({ x: event.clientX, y: event.clientY })) {
          suppressNextPaneClick();
        }
        return;
      }

      if (paneClickSuppressedRef.current) {
        releasePaneClickSuppression();
        return;
      }

      if (event.detail >= 2) {
        openNodeMenu({ x: event.clientX, y: event.clientY });
        suppressNextPaneClick();
        return;
      }

      setSelectedNodeId(null);
      dismissNodeMenu();
      onBlankPaneClick?.();
    },
    [
      commitPlacement,
      dismissNodeMenu,
      onBlankPaneClick,
      openNodeMenu,
      placementActive,
      releasePaneClickSuppression,
      setSelectedNodeId,
      suppressNextPaneClick,
    ],
  );

  return {
    handlePaneClick,
    suppressNextPaneClick,
    releasePaneClickSuppression,
  };
}
