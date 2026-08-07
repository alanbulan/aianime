// Copyright (c) 2026 AI anime
import { useEffect, useRef, type RefObject } from 'react';

import type { CanvasViewportPort } from '../application/bookmarkActions';
import type { CanvasViewportSnapshot } from './useCanvasViewportCommit';

const MINIMAP_FALLBACK_WIDTH = 200;
const MINIMAP_FALLBACK_HEIGHT = 150;
const FOLLOW_PER_FRAME = 0.3;
const REFERENCE_FRAME_MS = 1000 / 60;
const SETTLE_EPSILON_PX = 0.4;
const MAX_FRAME_MS = 64;

export interface CanvasMinimapPanNode {
  hidden?: boolean;
}

export interface CanvasMinimapPanRuntimePort<
  TNode extends CanvasMinimapPanNode = CanvasMinimapPanNode,
> extends CanvasViewportPort {
  getNodes: () => TNode[];
  getNodesBounds: (nodes: TNode[]) => { width: number; height: number };
}

export interface SmoothMinimapPanOptions<
  TNode extends CanvasMinimapPanNode = CanvasMinimapPanNode,
> {
  enabled: boolean;
  wrapperRef: RefObject<HTMLDivElement | null>;
  runtimePort: CanvasMinimapPanRuntimePort<TNode>;
  onPanStart?: () => void;
  onPanEnd?: (pointerInsideMinimap: boolean) => void;
  onViewportSettled?: (viewport: CanvasViewportSnapshot) => void;
}

export function useSmoothMinimapPan<
  TNode extends CanvasMinimapPanNode,
>({
  enabled,
  wrapperRef,
  runtimePort,
  onPanStart,
  onPanEnd,
  onViewportSettled,
}: SmoothMinimapPanOptions<TNode>): void {
  const onPanStartRef = useRef(onPanStart);
  const onPanEndRef = useRef(onPanEnd);
  const onViewportSettledRef = useRef(onViewportSettled);
  onPanStartRef.current = onPanStart;
  onPanEndRef.current = onPanEnd;
  onViewportSettledRef.current = onViewportSettled;

  useEffect(() => {
    if (!enabled) return;
    const minimap = wrapperRef.current?.querySelector<HTMLElement>(
      '.react-flow__minimap',
    );
    const svg = minimap?.querySelector<SVGSVGElement>('svg');
    if (!minimap || !svg) return;
    const minimapElement = minimap;

    let activePointerId: number | null = null;
    let startClientX = 0;
    let startClientY = 0;
    let startViewportX = 0;
    let startViewportY = 0;
    let moveScale = 1;
    let targetX = 0;
    let targetY = 0;
    let animationFrameId = 0;
    let lastFrameTime = 0;
    let pendingPanEndInside: boolean | null = null;

    const flushPanEnd = () => {
      if (pendingPanEndInside === null) return;
      const pointerInside = pendingPanEndInside;
      pendingPanEndInside = null;
      onPanEndRef.current?.(pointerInside);
    };

    const stopAnimation = () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
      lastFrameTime = 0;
    };

    const startAnimation = () => {
      if (animationFrameId) return;
      lastFrameTime = 0;
      animationFrameId = requestAnimationFrame(step);
    };

    function step(now: number) {
      const viewport = runtimePort.getViewport();
      const deltaMs = lastFrameTime
        ? Math.min(MAX_FRAME_MS, now - lastFrameTime)
        : REFERENCE_FRAME_MS;
      lastFrameTime = now;
      const progress = 1 - Math.pow(
        1 - FOLLOW_PER_FRAME,
        deltaMs / REFERENCE_FRAME_MS,
      );
      let nextX = viewport.x + (targetX - viewport.x) * progress;
      let nextY = viewport.y + (targetY - viewport.y) * progress;
      const settled =
        Math.abs(targetX - nextX) < SETTLE_EPSILON_PX
        && Math.abs(targetY - nextY) < SETTLE_EPSILON_PX;

      if (settled) {
        nextX = targetX;
        nextY = targetY;
      }
      if (viewport.x !== nextX || viewport.y !== nextY) {
        runtimePort.setViewport(
          { x: nextX, y: nextY, zoom: viewport.zoom },
          { duration: 0 },
        );
      }
      if (settled) {
        stopAnimation();
        onViewportSettledRef.current?.({
          x: nextX,
          y: nextY,
          zoom: viewport.zoom,
        });
        flushPanEnd();
        return;
      }
      animationFrameId = requestAnimationFrame(step);
    }

    const detachWindowListeners = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endPan);
      window.removeEventListener('pointercancel', endPan);
    };

    function handlePointerMove(event: PointerEvent) {
      if (activePointerId !== event.pointerId) return;
      targetX = startViewportX - (event.clientX - startClientX) * moveScale;
      targetY = startViewportY - (event.clientY - startClientY) * moveScale;
      startAnimation();
      event.preventDefault();
    }

    function endPan(event: PointerEvent) {
      if (activePointerId !== event.pointerId) return;
      activePointerId = null;
      detachWindowListeners();
      const rect = minimapElement.getBoundingClientRect();
      pendingPanEndInside =
        event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom;
      startAnimation();
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || activePointerId !== null) return;
      const viewport = runtimePort.getViewport();
      const visibleNodes = runtimePort.getNodes().filter((node) => !node.hidden);
      const bounds = runtimePort.getNodesBounds(visibleNodes);
      const rect = svg.getBoundingClientRect();
      const width = rect.width || MINIMAP_FALLBACK_WIDTH;
      const height = rect.height || MINIMAP_FALLBACK_HEIGHT;
      const viewScale = bounds.width > 0 && bounds.height > 0
        ? Math.max(bounds.width / width, bounds.height / height)
        : 1;

      moveScale = viewScale * viewport.zoom;
      pendingPanEndInside = null;
      activePointerId = event.pointerId;
      startClientX = event.clientX;
      startClientY = event.clientY;
      startViewportX = viewport.x;
      startViewportY = viewport.y;
      targetX = viewport.x;
      targetY = viewport.y;
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', endPan);
      window.addEventListener('pointercancel', endPan);
      onPanStartRef.current?.();
      event.preventDefault();
      event.stopPropagation();
    };

    svg.addEventListener('pointerdown', handlePointerDown);
    return () => {
      svg.removeEventListener('pointerdown', handlePointerDown);
      detachWindowListeners();
      stopAnimation();
      if (activePointerId !== null) {
        activePointerId = null;
        pendingPanEndInside = false;
      }
      flushPanEnd();
    };
  }, [enabled, runtimePort, wrapperRef]);
}
