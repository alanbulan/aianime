// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useRef, type RefObject } from 'react';

import type { CanvasConnectionPreviewRequest } from '@/modules/creative_canvas/public';

import {
  planCanvasBatchConnectTarget,
  resolveCanvasBatchConnectContext,
} from '../domain/canvasBatchConnection';
import type { CanvasNode, CanvasNodeType } from '../domain/canvasNodes';
import type { CanvasManualConnectionRequest } from '../ui/canvasConnectionInteraction';

const BATCH_CONNECT_SPAWN_GAP = 140;
const BATCH_CONNECT_SPAWN_VERTICAL_OFFSET = 160;

interface CanvasBatchConnectParams {
  clientPosition: { x: number; y: number };
}

export interface CanvasBatchConnectionMenuRequest {
  sourceIds: string[];
  allowedTypes: CanvasNodeType[];
  spawnFlowPosition: { x: number; y: number };
  menuPosition: { x: number; y: number };
}

export interface CanvasBatchConnectionControllerOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  nodes: readonly CanvasNode[];
  screenToFlowPosition: (
    clientPosition: { x: number; y: number },
  ) => { x: number; y: number };
  beginConnectionDrag: () => void;
  endConnectionDrag: () => void;
  prepareConnectionDrag: () => void;
  updateConnectionPreview: (
    preview: CanvasConnectionPreviewRequest | null,
  ) => void;
  openConnectionMenu: (request: CanvasBatchConnectionMenuRequest) => void;
  connectNodes: (connection: CanvasManualConnectionRequest) => void;
}

export interface CanvasBatchConnectionController {
  handleBatchConnectOpenMenu: (params: CanvasBatchConnectParams) => void;
  handleBatchConnectDragStart: (params: CanvasBatchConnectParams) => void;
  handleBatchConnectDragMove: (params: CanvasBatchConnectParams) => void;
  handleBatchConnectDragEnd: (params: CanvasBatchConnectParams) => void;
}

export function useCanvasBatchConnectionController({
  wrapperRef,
  nodes,
  screenToFlowPosition,
  beginConnectionDrag,
  endConnectionDrag,
  prepareConnectionDrag,
  updateConnectionPreview,
  openConnectionMenu,
  connectNodes,
}: CanvasBatchConnectionControllerOptions): CanvasBatchConnectionController {
  const dragRef = useRef<{
    sourceIds: string[];
    start: { x: number; y: number };
  } | null>(null);
  const context = useMemo(
    () => resolveCanvasBatchConnectContext(nodes),
    [nodes],
  );

  const openMenu = useCallback(
    ({
      sourceIds,
      allowedTypes,
      spawnFlowPosition,
      menuClientPosition,
    }: {
      sourceIds: string[];
      allowedTypes: CanvasNodeType[];
      spawnFlowPosition: { x: number; y: number };
      menuClientPosition: { x: number; y: number };
    }) => {
      const containerRect = wrapperRef.current?.getBoundingClientRect();
      if (!containerRect) {
        return;
      }
      openConnectionMenu({
        sourceIds,
        allowedTypes,
        spawnFlowPosition,
        menuPosition: {
          x: menuClientPosition.x - containerRect.left,
          y: menuClientPosition.y - containerRect.top,
        },
      });
    },
    [openConnectionMenu, wrapperRef],
  );

  const handleBatchConnectOpenMenu = useCallback(
    ({ clientPosition }: CanvasBatchConnectParams) => {
      if (!context) {
        return;
      }
      updateConnectionPreview(null);
      openMenu({
        sourceIds: context.sourceIds,
        allowedTypes: context.allowedTypes,
        spawnFlowPosition: {
          x: context.bboxRightCenter.x + BATCH_CONNECT_SPAWN_GAP,
          y: context.bboxRightCenter.y - BATCH_CONNECT_SPAWN_VERTICAL_OFFSET,
        },
        menuClientPosition: clientPosition,
      });
    },
    [context, openMenu, updateConnectionPreview],
  );

  const handleBatchConnectDragStart = useCallback(
    ({ clientPosition }: CanvasBatchConnectParams) => {
      const containerRect = wrapperRef.current?.getBoundingClientRect();
      if (!containerRect || !context) {
        return;
      }
      dragRef.current = {
        sourceIds: context.sourceIds,
        start: {
          x: clientPosition.x - containerRect.left,
          y: clientPosition.y - containerRect.top,
        },
      };
      beginConnectionDrag();
      prepareConnectionDrag();
    },
    [beginConnectionDrag, context, prepareConnectionDrag, wrapperRef],
  );

  const handleBatchConnectDragMove = useCallback(
    ({ clientPosition }: CanvasBatchConnectParams) => {
      const drag = dragRef.current;
      const containerRect = wrapperRef.current?.getBoundingClientRect();
      if (!drag || !containerRect) {
        return;
      }
      updateConnectionPreview({
        line: {
          start: drag.start,
          end: {
            x: clientPosition.x - containerRect.left,
            y: clientPosition.y - containerRect.top,
          },
          handleType: 'source',
        },
        containerSize: {
          width: containerRect.width,
          height: containerRect.height,
        },
      });
    },
    [updateConnectionPreview, wrapperRef],
  );

  const handleBatchConnectDragEnd = useCallback(
    ({ clientPosition }: CanvasBatchConnectParams) => {
      const drag = dragRef.current;
      dragRef.current = null;
      endConnectionDrag();

      const containerRect = wrapperRef.current?.getBoundingClientRect();
      if (!drag || !containerRect) {
        updateConnectionPreview(null);
        return;
      }

      const dropNodeElement = document
        .elementFromPoint(clientPosition.x, clientPosition.y)
        ?.closest?.('.react-flow__node[data-id]') as HTMLElement | null;
      const targetPlan = planCanvasBatchConnectTarget(
        nodes,
        drag.sourceIds,
        dropNodeElement?.dataset.id,
      );
      if (targetPlan) {
        for (const sourceId of targetPlan.sourceIds) {
          connectNodes({
            source: sourceId,
            target: targetPlan.targetId,
            sourceHandle: 'source',
            targetHandle: 'target',
          });
        }
        updateConnectionPreview(null);
        return;
      }

      if (!context) {
        updateConnectionPreview(null);
        return;
      }
      openMenu({
        sourceIds: context.sourceIds,
        allowedTypes: context.allowedTypes,
        spawnFlowPosition: screenToFlowPosition(clientPosition),
        menuClientPosition: clientPosition,
      });
    },
    [
      connectNodes,
      context,
      endConnectionDrag,
      nodes,
      openMenu,
      screenToFlowPosition,
      updateConnectionPreview,
      wrapperRef,
    ],
  );

  return {
    handleBatchConnectOpenMenu,
    handleBatchConnectDragStart,
    handleBatchConnectDragMove,
    handleBatchConnectDragEnd,
  };
}
