// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

import type {
  CanvasConnectionNodeLike,
  CanvasConnectionNodeType,
} from '../domain/canvasConnection';
import type {
  CanvasConnectionMenuRequest,
  CanvasConnectionPreviewRequest,
  CanvasPendingConnectionStart,
} from '../domain/canvasConnectionPreview';
import {
  resolveCanvasPlusConnectionEnd,
  resolveCanvasPlusConnectionStart,
  resolveManualDropTargetElement,
  type CanvasManualConnectionRequest,
  type CanvasPlusConnectionParams,
} from './canvasConnectionInteraction';

const DROP_TARGET_CLASS_NAME = 'canvas-node-drop-target';

export interface CanvasPlusConnectionControllerOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  nodes: readonly CanvasConnectionNodeLike[];
  clearHoveredNodeTimer: () => void;
  clearHoveredNode: () => void;
  prepareConnectionDrag: (pending: CanvasPendingConnectionStart) => void;
  clearConnection: () => void;
  updateConnectionPreview: (
    preview: CanvasConnectionPreviewRequest | null,
  ) => void;
  openConnectionMenu: (
    request: CanvasConnectionMenuRequest<CanvasConnectionNodeType>,
  ) => void;
  connectNodes: (connection: CanvasManualConnectionRequest) => void;
}

export interface CanvasPlusConnectionController {
  isPlusConnectDragging: boolean;
  beginPlusConnectDrag: () => void;
  endPlusConnectDrag: () => void;
  handlePlusOpenMenu: (params: CanvasPlusConnectionParams) => void;
  handlePlusConnectDragStart: (params: CanvasPlusConnectionParams) => void;
  handlePlusConnectDragMove: (params: CanvasPlusConnectionParams) => void;
  handlePlusConnectDragEnd: (params: CanvasPlusConnectionParams) => void;
}

export function useCanvasPlusConnectionController({
  wrapperRef,
  nodes,
  clearHoveredNodeTimer,
  clearHoveredNode,
  prepareConnectionDrag,
  clearConnection,
  updateConnectionPreview,
  openConnectionMenu,
  connectNodes,
}: CanvasPlusConnectionControllerOptions): CanvasPlusConnectionController {
  const activeConnectionRef = useRef<CanvasPendingConnectionStart | null>(null);
  const dropTargetElementRef = useRef<HTMLElement | null>(null);
  const [isPlusConnectDragging, setIsPlusConnectDragging] = useState(false);

  const beginPlusConnectDrag = useCallback(() => {
    setIsPlusConnectDragging(true);
  }, []);

  const endPlusConnectDrag = useCallback(() => {
    setIsPlusConnectDragging(false);
  }, []);

  const clearDropTargetHighlight = useCallback(() => {
    dropTargetElementRef.current?.classList.remove(DROP_TARGET_CLASS_NAME);
    dropTargetElementRef.current = null;
  }, []);

  useEffect(() => clearDropTargetHighlight, [clearDropTargetHighlight]);

  const handlePlusOpenMenu = useCallback(
    (params: CanvasPlusConnectionParams) => {
      const resolution = resolveCanvasPlusConnectionStart({
        params,
        nodes,
        wrapperElement: wrapperRef.current,
      });
      if (!resolution || resolution.allowedTypes.length === 0) {
        return;
      }
      openConnectionMenu({
        pending: resolution.pending,
        clientPosition: params.clientPosition,
        menuPosition: resolution.menuPosition,
        allowedTypes: resolution.allowedTypes,
        preview: null,
      });
    },
    [nodes, openConnectionMenu, wrapperRef],
  );

  const handlePlusConnectDragStart = useCallback(
    (params: CanvasPlusConnectionParams) => {
      const resolution = resolveCanvasPlusConnectionStart({
        params,
        nodes,
        wrapperElement: wrapperRef.current,
      });
      if (!resolution) {
        return;
      }
      clearHoveredNodeTimer();
      clearDropTargetHighlight();
      clearHoveredNode();
      beginPlusConnectDrag();
      activeConnectionRef.current = resolution.pending;
      prepareConnectionDrag(resolution.pending);
    },
    [
      beginPlusConnectDrag,
      clearDropTargetHighlight,
      clearHoveredNode,
      clearHoveredNodeTimer,
      nodes,
      prepareConnectionDrag,
      wrapperRef,
    ],
  );

  const handlePlusConnectDragMove = useCallback(
    (params: CanvasPlusConnectionParams) => {
      const pending = activeConnectionRef.current;
      const containerRect = wrapperRef.current?.getBoundingClientRect();
      if (!pending?.start || !containerRect) {
        return;
      }

      updateConnectionPreview({
        line: {
          start: pending.start,
          end: {
            x: params.clientPosition.x - containerRect.left,
            y: params.clientPosition.y - containerRect.top,
          },
          handleType: pending.handleType,
        },
        containerSize: {
          width: containerRect.width,
          height: containerRect.height,
        },
      });

      const dropTargetElement = resolveManualDropTargetElement({
        clientPosition: params.clientPosition,
        pending,
        nodes,
        wrapperElement: wrapperRef.current,
      });
      if (dropTargetElement === dropTargetElementRef.current) {
        return;
      }
      clearDropTargetHighlight();
      if (dropTargetElement) {
        dropTargetElement.classList.add(DROP_TARGET_CLASS_NAME);
        dropTargetElementRef.current = dropTargetElement;
      }
    },
    [clearDropTargetHighlight, nodes, updateConnectionPreview, wrapperRef],
  );

  const handlePlusConnectDragEnd = useCallback(
    (params: CanvasPlusConnectionParams) => {
      const pending = activeConnectionRef.current;
      activeConnectionRef.current = null;
      endPlusConnectDrag();
      clearDropTargetHighlight();

      const resolution = resolveCanvasPlusConnectionEnd({
        clientPosition: params.clientPosition,
        pending,
        nodes,
        wrapperElement: wrapperRef.current,
      });
      if (resolution.kind === 'cancel') {
        clearConnection();
        return;
      }
      if (resolution.kind === 'connect') {
        connectNodes({
          source: resolution.source,
          target: resolution.target,
          sourceHandle: resolution.sourceHandle,
          targetHandle: resolution.targetHandle,
        });
        clearConnection();
        return;
      }
      if (!pending) {
        clearConnection();
        return;
      }
      openConnectionMenu({
        pending,
        clientPosition: resolution.clientPosition,
        menuPosition: resolution.menuPosition,
        allowedTypes: resolution.allowedTypes,
        preview: resolution.previewLine
          ? {
              line: resolution.previewLine,
              containerSize: resolution.containerSize,
            }
          : null,
      });
    },
    [
      clearConnection,
      clearDropTargetHighlight,
      connectNodes,
      endPlusConnectDrag,
      nodes,
      openConnectionMenu,
      wrapperRef,
    ],
  );

  return {
    isPlusConnectDragging,
    beginPlusConnectDrag,
    endPlusConnectDrag,
    handlePlusOpenMenu,
    handlePlusConnectDragStart,
    handlePlusConnectDragMove,
    handlePlusConnectDragEnd,
  };
}
