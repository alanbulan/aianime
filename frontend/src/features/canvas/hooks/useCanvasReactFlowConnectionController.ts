// Copyright (c) 2026 AI anime
import { useCallback, type RefObject } from 'react';
import type {
  FinalConnectionState,
  OnConnectStartParams,
} from '@xyflow/react';

import type {
  CanvasConnectionMenuRequest,
  CanvasPendingConnectionStart,
} from '@/modules/creative_canvas/public';

import type { CanvasNode, CanvasNodeType } from '../domain/canvasNodes';
import {
  resolveCanvasConnectionEnd,
  resolveCanvasConnectionStart,
  type CanvasManualConnectionRequest,
} from '../ui/canvasConnectionInteraction';

export interface CanvasReactFlowConnectionControllerOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  nodes: readonly CanvasNode[];
  pendingConnection: CanvasPendingConnectionStart | null;
  prepareConnectionStart: (
    pending: CanvasPendingConnectionStart | null,
  ) => void;
  clearConnection: () => void;
  openConnectionMenu: (
    request: CanvasConnectionMenuRequest<CanvasNodeType>,
  ) => void;
  connectNodes: (connection: CanvasManualConnectionRequest) => void;
}

export interface CanvasReactFlowConnectionController {
  handleConnectStart: (
    event: MouseEvent | TouchEvent,
    params: OnConnectStartParams,
  ) => void;
  handleConnectEnd: (
    event: MouseEvent | TouchEvent,
    connectionState: FinalConnectionState,
  ) => void;
}

export function useCanvasReactFlowConnectionController({
  wrapperRef,
  nodes,
  pendingConnection,
  prepareConnectionStart,
  clearConnection,
  openConnectionMenu,
  connectNodes,
}: CanvasReactFlowConnectionControllerOptions): CanvasReactFlowConnectionController {
  const handleConnectStart = useCallback(
    (event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      prepareConnectionStart(resolveCanvasConnectionStart({
        event,
        params,
        nodes,
        containerRect: wrapperRef.current?.getBoundingClientRect(),
      }));
    },
    [nodes, prepareConnectionStart, wrapperRef],
  );

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      const resolution = resolveCanvasConnectionEnd({
        event,
        connectionState,
        pending: pendingConnection,
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
      if (!pendingConnection) {
        clearConnection();
        return;
      }
      openConnectionMenu({
        pending: pendingConnection,
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
      connectNodes,
      nodes,
      openConnectionMenu,
      pendingConnection,
      wrapperRef,
    ],
  );

  return {
    handleConnectStart,
    handleConnectEnd,
  };
}
