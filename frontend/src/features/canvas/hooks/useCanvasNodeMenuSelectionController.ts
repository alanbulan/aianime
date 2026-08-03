// Copyright (c) 2026 AI anime
import { useCallback, type RefObject } from 'react';

import type {
  CanvasNodePlacement,
  SkillDefinition,
} from '@/modules/creative_canvas/public';

import type { CanvasSpawnConnectionOrigin } from '../application/canvasEdgeCreation';
import {
  createCanvasSkillNodeData,
  planCanvasNodeMenuSelection,
} from '../application/canvasNodeMenuSelection';
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
} from '../domain/canvasNodes';
import type { CanvasSpawnedNodeConnectionRequest } from './useCanvasConnectionController';

export interface CanvasNodeMenuSelectionControllerOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  nodes: readonly CanvasNode[];
  flowPosition: { x: number; y: number };
  menuPosition: { x: number; y: number };
  menuAllowedTypes: readonly CanvasNodeType[] | undefined;
  pendingConnection: CanvasSpawnConnectionOrigin | null;
  pendingBatchSourceIds: readonly string[] | null;
  getLastCanvasPointerPosition: () => { x: number; y: number } | null;
  createNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeData>,
  ) => string;
  beginNodePlacement: (
    placement: CanvasNodePlacement<CanvasNodeType, CanvasNodeData>,
    clientPosition: { x: number; y: number } | null,
  ) => void;
  connectSpawnedNode: (request: CanvasSpawnedNodeConnectionRequest) => void;
  selectNode: (nodeId: string | null) => void;
  hideMenuForPlacement: () => void;
  closeNodeMenu: () => void;
  releasePaneClickSuppression: () => void;
}

export interface CanvasNodeMenuSelectionController {
  selectNodeType: (
    type: CanvasNodeType,
    selectionClientPosition?: { x: number; y: number },
  ) => void;
  selectSkill: (skill: SkillDefinition) => void;
}

export function useCanvasNodeMenuSelectionController({
  wrapperRef,
  nodes,
  flowPosition,
  menuPosition,
  menuAllowedTypes,
  pendingConnection,
  pendingBatchSourceIds,
  getLastCanvasPointerPosition,
  createNode,
  beginNodePlacement,
  connectSpawnedNode,
  selectNode,
  hideMenuForPlacement,
  closeNodeMenu,
  releasePaneClickSuppression,
}: CanvasNodeMenuSelectionControllerOptions): CanvasNodeMenuSelectionController {
  const resolvePlacementClientPosition = useCallback(
    (preferredPosition?: { x: number; y: number }) => {
      const containerRect = wrapperRef.current?.getBoundingClientRect();
      const fallbackPosition = containerRect
        ? {
            x: containerRect.left + menuPosition.x,
            y: containerRect.top + menuPosition.y,
          }
        : null;
      return preferredPosition
        ?? getLastCanvasPointerPosition()
        ?? fallbackPosition;
    },
    [getLastCanvasPointerPosition, menuPosition.x, menuPosition.y, wrapperRef],
  );

  const startPlacement = useCallback(
    (
      placement: CanvasNodePlacement<CanvasNodeType, CanvasNodeData>,
      preferredPosition?: { x: number; y: number },
    ) => {
      hideMenuForPlacement();
      beginNodePlacement(
        placement,
        resolvePlacementClientPosition(preferredPosition),
      );
      selectNode(null);
      releasePaneClickSuppression();
    },
    [
      beginNodePlacement,
      hideMenuForPlacement,
      releasePaneClickSuppression,
      resolvePlacementClientPosition,
      selectNode,
    ],
  );

  const finalizeSpawn = useCallback(
    (spawnedNodeId: string) => {
      connectSpawnedNode({
        spawnedNodeId,
        pendingConnection,
        batchSourceIds: pendingBatchSourceIds,
      });
      closeNodeMenu();
    },
    [
      closeNodeMenu,
      connectSpawnedNode,
      pendingBatchSourceIds,
      pendingConnection,
    ],
  );

  const selectNodeType = useCallback(
    (
      type: CanvasNodeType,
      selectionClientPosition?: { x: number; y: number },
    ) => {
      const plan = planCanvasNodeMenuSelection({
        type,
        nodes,
        pendingConnection,
        hasPendingBatchConnection: pendingBatchSourceIds !== null,
        hasAllowedTypeFilter: menuAllowedTypes !== undefined,
      });
      if (plan.kind === 'placement') {
        startPlacement(
          { type, initialData: plan.initialData },
          selectionClientPosition,
        );
        return;
      }

      finalizeSpawn(createNode(type, flowPosition, plan.initialData));
    },
    [
      createNode,
      finalizeSpawn,
      flowPosition,
      menuAllowedTypes,
      nodes,
      pendingBatchSourceIds,
      pendingConnection,
      startPlacement,
    ],
  );

  const selectSkill = useCallback(
    (skill: SkillDefinition) => {
      startPlacement({
        type: CANVAS_NODE_TYPES.skill,
        initialData: createCanvasSkillNodeData(skill),
        skill,
      });
    },
    [startPlacement],
  );

  return {
    selectNodeType,
    selectSkill,
  };
}
