// Copyright (c) 2026 AI anime
import { useCallback, type RefObject } from 'react';

import type {
  CanvasConnectionNodeType,
} from '../domain/canvasConnection';
import type {
  CanvasBatchConnectionNode,
} from '../domain/canvasBatchConnection';
import type {
  CanvasConnectionMenuRequest,
  CanvasConnectionPreviewRequest,
  CanvasPendingConnectionStart,
} from '../domain/canvasConnectionPreview';

import type { CanvasManualConnectionRequest } from './canvasConnectionInteraction';
import {
  useCanvasBatchConnectionController,
  type CanvasBatchConnectionController,
  type CanvasBatchConnectionMenuRequest,
} from './useCanvasBatchConnectionController';
import {
  useCanvasPlusConnectionController,
  type CanvasPlusConnectionController,
} from './useCanvasPlusConnectionController';
import {
  useCanvasReactFlowConnectionController,
  type CanvasReactFlowConnectionController,
} from './useCanvasReactFlowConnectionController';

interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasConnectionGestureControllerOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  nodes: readonly CanvasBatchConnectionNode[];
  screenToFlowPosition: (clientPosition: CanvasPosition) => CanvasPosition;
  clearHoveredNodeTimer: () => void;
  setHoveredNodeId: (nodeId: string | null) => void;
  pendingConnection: CanvasPendingConnectionStart | null;
  prepareConnectionStart: (
    pending: CanvasPendingConnectionStart | null,
  ) => void;
  prepareBatchConnectionDrag: () => void;
  clearConnection: () => void;
  updateConnectionPreview: (
    preview: CanvasConnectionPreviewRequest | null,
  ) => void;
  openConnectionMenuState: (
    request: CanvasConnectionMenuRequest<CanvasConnectionNodeType>,
    spawnFlowPosition: CanvasPosition,
  ) => void;
  openBatchConnectionMenuState: (
    request: CanvasBatchConnectionMenuRequest,
  ) => void;
  suppressNextPaneClick: () => void;
  connectNodes: (connection: CanvasManualConnectionRequest) => void;
}

export interface CanvasConnectionGestureController
  extends CanvasPlusConnectionController,
  CanvasReactFlowConnectionController,
  CanvasBatchConnectionController {}

export function useCanvasConnectionGestureController({
  wrapperRef,
  nodes,
  screenToFlowPosition,
  clearHoveredNodeTimer,
  setHoveredNodeId,
  pendingConnection,
  prepareConnectionStart,
  prepareBatchConnectionDrag,
  clearConnection,
  updateConnectionPreview,
  openConnectionMenuState,
  openBatchConnectionMenuState,
  suppressNextPaneClick,
  connectNodes,
}: CanvasConnectionGestureControllerOptions): CanvasConnectionGestureController {
  const openConnectionMenu = useCallback(
    (request: CanvasConnectionMenuRequest<CanvasConnectionNodeType>) => {
      openConnectionMenuState(
        request,
        screenToFlowPosition(request.clientPosition),
      );
      suppressNextPaneClick();
    },
    [openConnectionMenuState, screenToFlowPosition, suppressNextPaneClick],
  );
  const clearHoveredNode = useCallback(
    () => setHoveredNodeId(null),
    [setHoveredNodeId],
  );
  const plusConnection = useCanvasPlusConnectionController({
    wrapperRef,
    nodes,
    clearHoveredNodeTimer,
    clearHoveredNode,
    prepareConnectionDrag: prepareConnectionStart,
    clearConnection,
    updateConnectionPreview,
    openConnectionMenu,
    connectNodes,
  });
  const reactFlowConnection = useCanvasReactFlowConnectionController({
    wrapperRef,
    nodes,
    pendingConnection,
    prepareConnectionStart,
    clearConnection,
    openConnectionMenu,
    connectNodes,
  });
  const openBatchConnectionMenu = useCallback(
    (request: CanvasBatchConnectionMenuRequest) => {
      openBatchConnectionMenuState(request);
      suppressNextPaneClick();
    },
    [openBatchConnectionMenuState, suppressNextPaneClick],
  );
  const batchConnection = useCanvasBatchConnectionController({
    wrapperRef,
    nodes,
    screenToFlowPosition,
    beginConnectionDrag: plusConnection.beginPlusConnectDrag,
    endConnectionDrag: plusConnection.endPlusConnectDrag,
    prepareConnectionDrag: prepareBatchConnectionDrag,
    updateConnectionPreview,
    openConnectionMenu: openBatchConnectionMenu,
    connectNodes,
  });

  return {
    ...plusConnection,
    ...reactFlowConnection,
    ...batchConnection,
  };
}
