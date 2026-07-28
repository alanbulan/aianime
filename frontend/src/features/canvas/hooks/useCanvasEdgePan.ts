// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, type RefObject } from 'react';

import type { CanvasViewportPort } from '../application/bookmarkActions';
import type { CanvasViewportSnapshot } from './useCanvasViewportCommit';

const EDGE_PAN_DRAG_THRESHOLD_PX = 4;
const EDGE_PATH_SELECTOR = '.react-flow__edge-path, .react-flow__edge-interaction';
const EDGE_UPDATER_SELECTOR = '.react-flow__edgeupdater';

interface EdgeClickEvent {
  preventDefault: () => void;
  stopPropagation: () => void;
}

interface EdgePanGesture {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startViewportX: number;
  startViewportY: number;
  zoom: number;
  moved: boolean;
}

export interface CanvasEdgePanController {
  handleEdgeClick: (event: EdgeClickEvent) => void;
}

export interface CanvasEdgePanOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  viewportPort: CanvasViewportPort;
  commitViewport: (viewport: CanvasViewportSnapshot) => void;
}

export function useCanvasEdgePan({
  wrapperRef,
  viewportPort,
  commitViewport,
}: CanvasEdgePanOptions): CanvasEdgePanController {
  const gestureRef = useRef<EdgePanGesture | null>(null);
  const suppressNextEdgeClickRef = useRef(false);

  const handleEdgeClick = useCallback((event: EdgeClickEvent) => {
    if (!suppressNextEdgeClickRef.current) {
      return;
    }
    suppressNextEdgeClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  useEffect(() => {
    const wrapperElement = wrapperRef.current;
    if (!wrapperElement) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        !target
        || target.closest(EDGE_UPDATER_SELECTOR)
        || !target.closest(EDGE_PATH_SELECTOR)
      ) {
        return;
      }

      const viewport = viewportPort.getViewport();
      gestureRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewportX: viewport.x,
        startViewportY: viewport.y,
        zoom: viewport.zoom,
        moved: false,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }

      const deltaX = event.clientX - gesture.startClientX;
      const deltaY = event.clientY - gesture.startClientY;
      if (
        !gesture.moved
        && Math.hypot(deltaX, deltaY) >= EDGE_PAN_DRAG_THRESHOLD_PX
      ) {
        gesture.moved = true;
      }
      if (!gesture.moved) {
        return;
      }

      suppressNextEdgeClickRef.current = true;
      viewportPort.setViewport(
        {
          x: gesture.startViewportX + deltaX,
          y: gesture.startViewportY + deltaY,
          zoom: gesture.zoom,
        },
        { duration: 0 },
      );
    };

    const completeGesture = () => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (gesture?.moved) {
        commitViewport(viewportPort.getViewport());
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId === event.pointerId) {
        completeGesture();
      }
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId === event.pointerId) {
        completeGesture();
      }
    };

    wrapperElement.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
    return () => {
      wrapperElement.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
    };
  }, [commitViewport, viewportPort, wrapperRef]);

  return { handleEdgeClick };
}
