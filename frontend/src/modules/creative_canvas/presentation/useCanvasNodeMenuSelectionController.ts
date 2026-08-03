// Copyright (c) 2026 AI anime
import { useCallback, type RefObject } from 'react';

import {
  createCanvasSkillNodeData,
  planCanvasNodeMenuSelection,
  type CanvasNodeMenuConnectionOrigin,
  type CanvasNodeMenuCreationData,
  type CanvasNodeMenuSelectionNode,
  type CanvasNodeMenuTypes,
} from '@/modules/creative_canvas/application/canvasNodeMenuSelection';
import type { SkillDefinition } from '@/modules/creative_canvas/domain/skillContract';

export interface CanvasNodeMenuPlacement<TNodeType extends string = string> {
  type: TNodeType;
  initialData?: CanvasNodeMenuCreationData;
  skill?: SkillDefinition;
}

export interface CanvasSpawnedNodeConnectionRequest {
  spawnedNodeId: string;
  pendingConnection: CanvasNodeMenuConnectionOrigin | null;
  batchSourceIds: readonly string[] | null;
}

export interface CanvasNodeMenuSelectionControllerOptions<
  TNodeType extends string = string,
  TNode extends CanvasNodeMenuSelectionNode = CanvasNodeMenuSelectionNode,
> {
  wrapperRef: RefObject<HTMLDivElement | null>;
  nodes: readonly TNode[];
  nodeTypes: CanvasNodeMenuTypes<TNodeType>;
  flowPosition: { x: number; y: number };
  menuPosition: { x: number; y: number };
  menuAllowedTypes: readonly TNodeType[] | undefined;
  pendingConnection: CanvasNodeMenuConnectionOrigin | null;
  pendingBatchSourceIds: readonly string[] | null;
  getLastCanvasPointerPosition: () => { x: number; y: number } | null;
  createNode: (
    type: TNodeType,
    position: { x: number; y: number },
    data?: CanvasNodeMenuCreationData,
  ) => string;
  beginNodePlacement: (
    placement: CanvasNodeMenuPlacement<TNodeType>,
    clientPosition: { x: number; y: number } | null,
  ) => void;
  connectSpawnedNode: (request: CanvasSpawnedNodeConnectionRequest) => void;
  selectNode: (nodeId: string | null) => void;
  hideMenuForPlacement: () => void;
  closeNodeMenu: () => void;
  releasePaneClickSuppression: () => void;
}

export interface CanvasNodeMenuSelectionController<
  TNodeType extends string = string,
> {
  selectNodeType: (
    type: TNodeType,
    selectionClientPosition?: { x: number; y: number },
  ) => void;
  selectSkill: (skill: SkillDefinition) => void;
}

export function useCanvasNodeMenuSelectionController<
  TNodeType extends string,
  TNode extends CanvasNodeMenuSelectionNode,
>({
  wrapperRef,
  nodes,
  nodeTypes,
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
}: CanvasNodeMenuSelectionControllerOptions<
  TNodeType,
  TNode
>): CanvasNodeMenuSelectionController<TNodeType> {
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
      placement: CanvasNodeMenuPlacement<TNodeType>,
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
      type: TNodeType,
      selectionClientPosition?: { x: number; y: number },
    ) => {
      const plan = planCanvasNodeMenuSelection({
        type,
        nodes,
        nodeTypes,
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
      nodeTypes,
      nodes,
      pendingBatchSourceIds,
      pendingConnection,
      startPlacement,
    ],
  );

  const selectSkill = useCallback(
    (skill: SkillDefinition) => {
      startPlacement({
        type: nodeTypes.skill,
        initialData: createCanvasSkillNodeData(skill),
        skill,
      });
    },
    [nodeTypes.skill, startPlacement],
  );

  return {
    selectNodeType,
    selectSkill,
  };
}
