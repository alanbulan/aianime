// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

import type { CanvasNode } from '../domain/canvasNodes';
import { collectCanvasNodeIdsInRect } from '../domain/canvasSelection';
import { isCanvasPaneTarget } from '@/modules/creative_canvas/public';
import { useCanvasSpacePan } from './useCanvasSpacePan';

const MARQUEE_SELECTION_MIN_DISTANCE_PX = 6;

interface CanvasPoint {
  x: number;
  y: number;
}

interface CanvasCoordinatePort {
  screenToFlowPosition: (position: CanvasPoint) => CanvasPoint;
}

interface CanvasNodeSelectionChange {
  id: string;
  type: 'select';
  selected: boolean;
}

interface MarqueeGesture {
  active: boolean;
  pointerId: number;
  startClient: CanvasPoint;
  startLocal: CanvasPoint;
}

export interface CanvasMarqueeSelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CanvasMarqueeSelectionOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  nodes: readonly CanvasNode[];
  coordinatePort: CanvasCoordinatePort;
  applyNodeSelectionChanges: (changes: CanvasNodeSelectionChange[]) => void;
  setNativeSelectionActive: (active: boolean) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  onMarqueeStart: () => void;
}

export interface CanvasMarqueeSelectionController {
  marqueeSelectionRect: CanvasMarqueeSelectionRect | null;
}

export function useCanvasMarqueeSelection({
  wrapperRef,
  disabled,
  nodes,
  coordinatePort,
  applyNodeSelectionChanges,
  setNativeSelectionActive,
  setSelectedNodeId,
  onMarqueeStart,
}: CanvasMarqueeSelectionOptions): CanvasMarqueeSelectionController {
  const gestureRef = useRef<MarqueeGesture | null>(null);
  const swallowTrailingClickRef = useRef(false);
  const [marqueeSelectionRect, setMarqueeSelectionRect] =
    useState<CanvasMarqueeSelectionRect | null>(null);

  const clearMarqueeSelection = useCallback(() => {
    gestureRef.current = null;
    setMarqueeSelectionRect(null);
  }, []);
  const { isSpacePanActive } = useCanvasSpacePan(clearMarqueeSelection);

  useEffect(() => {
    const wrapperElement = wrapperRef.current;
    if (!wrapperElement) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      swallowTrailingClickRef.current = false;
      if (disabled || event.button !== 0) {
        return;
      }
      if (isSpacePanActive()) {
        clearMarqueeSelection();
        return;
      }
      if (!isCanvasPaneTarget(event.target, wrapperElement)) {
        return;
      }

      const containerRect = wrapperElement.getBoundingClientRect();
      gestureRef.current = {
        active: false,
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startLocal: {
          x: event.clientX - containerRect.left,
          y: event.clientY - containerRect.top,
        },
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }
      if (isSpacePanActive()) {
        clearMarqueeSelection();
        return;
      }

      const distance = Math.hypot(
        event.clientX - gesture.startClient.x,
        event.clientY - gesture.startClient.y,
      );
      if (!gesture.active && distance < MARQUEE_SELECTION_MIN_DISTANCE_PX) {
        return;
      }
      if (!gesture.active) {
        gesture.active = true;
        onMarqueeStart();
        setSelectedNodeId(null);
        setNativeSelectionActive(false);
      }

      const containerRect = wrapperElement.getBoundingClientRect();
      const current = {
        x: event.clientX - containerRect.left,
        y: event.clientY - containerRect.top,
      };
      setMarqueeSelectionRect({
        left: Math.min(gesture.startLocal.x, current.x),
        top: Math.min(gesture.startLocal.y, current.y),
        width: Math.abs(current.x - gesture.startLocal.x),
        height: Math.abs(current.y - gesture.startLocal.y),
      });
      event.preventDefault();
      event.stopPropagation();
    };

    const handlePointerUp = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }
      if (isSpacePanActive()) {
        clearMarqueeSelection();
        return;
      }

      const distance = Math.hypot(
        event.clientX - gesture.startClient.x,
        event.clientY - gesture.startClient.y,
      );
      // Down/up distance also catches fast flicks with no intermediate move event.
      if (distance < MARQUEE_SELECTION_MIN_DISTANCE_PX) {
        clearMarqueeSelection();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const startFlow = coordinatePort.screenToFlowPosition(gesture.startClient);
      const endFlow = coordinatePort.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const selectedIds = collectCanvasNodeIdsInRect(nodes, {
        x: Math.min(startFlow.x, endFlow.x),
        y: Math.min(startFlow.y, endFlow.y),
        width: Math.abs(endFlow.x - startFlow.x),
        height: Math.abs(endFlow.y - startFlow.y),
      });
      const changes = nodes
        .filter((node) => Boolean(node.selected) !== selectedIds.has(node.id))
        .map((node) => ({
          id: node.id,
          type: 'select' as const,
          selected: selectedIds.has(node.id),
        }));
      if (changes.length > 0) {
        applyNodeSelectionChanges(changes);
      }
      setNativeSelectionActive(selectedIds.size > 0);
      setSelectedNodeId(selectedIds.size === 1 ? [...selectedIds][0] : null);
      // React Flow's trailing pane click would otherwise clear this selection immediately.
      swallowTrailingClickRef.current = true;
      clearMarqueeSelection();
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (!swallowTrailingClickRef.current) {
        return;
      }
      swallowTrailingClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId === event.pointerId) {
        clearMarqueeSelection();
      }
    };

    wrapperElement.addEventListener('pointerdown', handlePointerDown, true);
    wrapperElement.addEventListener('click', handleClickCapture, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
    return () => {
      wrapperElement.removeEventListener('pointerdown', handlePointerDown, true);
      wrapperElement.removeEventListener('click', handleClickCapture, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
    };
  }, [
    applyNodeSelectionChanges,
    clearMarqueeSelection,
    coordinatePort,
    disabled,
    isSpacePanActive,
    nodes,
    onMarqueeStart,
    setNativeSelectionActive,
    setSelectedNodeId,
    wrapperRef,
  ]);

  return { marqueeSelectionRect };
}
