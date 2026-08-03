// Copyright (c) 2026 AI anime
import {
  useCallback,
  useMemo,
  useState,
  type RefObject,
} from 'react';

import type { SkillDefinition } from '@/modules/creative_canvas/domain/skillContract';

const NODE_PLACEMENT_PREVIEW_WIDTH = 320;
const NODE_PLACEMENT_PREVIEW_HEIGHT = 200;

export interface CanvasNodePlacement<
  TNodeType = string,
  TNodeData extends object = Record<string, unknown>,
> {
  type: TNodeType;
  initialData?: Partial<TNodeData>;
  skill?: SkillDefinition;
}

export interface CanvasNodePlacementPreview {
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
}

export interface CanvasNodePlacementControllerOptions<
  TNodeType = string,
  TNodeData extends object = Record<string, unknown>,
> {
  wrapperRef: RefObject<HTMLDivElement | null>;
  screenToFlowPosition: (
    clientPosition: { x: number; y: number },
  ) => { x: number; y: number };
  createNode: (
    type: TNodeType,
    position: { x: number; y: number },
    initialData?: Partial<TNodeData>,
  ) => string;
  selectNode: (nodeId: string) => void;
  bindSkill: (nodeId: string, skill: SkillDefinition) => void;
  confirmPlacement: (nodeId: string) => void;
  resolvePlacementLabel: (
    placement: CanvasNodePlacement<TNodeType, TNodeData>,
  ) => string;
}

export interface CanvasNodePlacementController<
  TNodeType = string,
  TNodeData extends object = Record<string, unknown>,
> {
  placementActive: boolean;
  placementPreview: CanvasNodePlacementPreview | null;
  beginNodePlacement: (
    placement: CanvasNodePlacement<TNodeType, TNodeData>,
    clientPosition: { x: number; y: number } | null,
  ) => void;
  updateNodePlacementClientPosition: (
    clientPosition: { x: number; y: number },
  ) => void;
  cancelNodePlacement: () => void;
  commitNodePlacementAtClientPosition: (
    clientPosition: { x: number; y: number },
  ) => boolean;
}

export function useCanvasNodePlacementController<
  TNodeType,
  TNodeData extends object,
>({
  wrapperRef,
  screenToFlowPosition,
  createNode,
  selectNode,
  bindSkill,
  confirmPlacement,
  resolvePlacementLabel,
}: CanvasNodePlacementControllerOptions<
  TNodeType,
  TNodeData
>): CanvasNodePlacementController<TNodeType, TNodeData> {
  const [pendingPlacement, setPendingPlacement] =
    useState<CanvasNodePlacement<TNodeType, TNodeData> | null>(null);
  const [placementClientPosition, setPlacementClientPosition] =
    useState<{ x: number; y: number } | null>(null);

  const beginNodePlacement = useCallback(
    (
      placement: CanvasNodePlacement<TNodeType, TNodeData>,
      clientPosition: { x: number; y: number } | null,
    ) => {
      setPendingPlacement(placement);
      setPlacementClientPosition(clientPosition);
    },
    [],
  );

  const cancelNodePlacement = useCallback(() => {
    setPendingPlacement(null);
    setPlacementClientPosition(null);
  }, []);

  const commitNodePlacementAtClientPosition = useCallback(
    (clientPosition: { x: number; y: number }): boolean => {
      if (!pendingPlacement) {
        return false;
      }
      const nodeId = createNode(
        pendingPlacement.type,
        screenToFlowPosition({
          x: clientPosition.x - NODE_PLACEMENT_PREVIEW_WIDTH / 2,
          y: clientPosition.y - NODE_PLACEMENT_PREVIEW_HEIGHT / 2,
        }),
        pendingPlacement.initialData,
      );
      selectNode(nodeId);
      if (pendingPlacement.skill) {
        bindSkill(nodeId, pendingPlacement.skill);
      }
      confirmPlacement(nodeId);
      setPendingPlacement(null);
      setPlacementClientPosition(null);
      return true;
    },
    [
      bindSkill,
      confirmPlacement,
      createNode,
      pendingPlacement,
      screenToFlowPosition,
      selectNode,
    ],
  );

  const placementPreview = useMemo<CanvasNodePlacementPreview | null>(() => {
    if (!pendingPlacement || !placementClientPosition) {
      return null;
    }
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperRect) {
      return null;
    }
    return {
      left:
        placementClientPosition.x
        - wrapperRect.left
        - NODE_PLACEMENT_PREVIEW_WIDTH / 2,
      top:
        placementClientPosition.y
        - wrapperRect.top
        - NODE_PLACEMENT_PREVIEW_HEIGHT / 2,
      width: NODE_PLACEMENT_PREVIEW_WIDTH,
      height: NODE_PLACEMENT_PREVIEW_HEIGHT,
      label: resolvePlacementLabel(pendingPlacement),
    };
  }, [
    pendingPlacement,
    placementClientPosition,
    resolvePlacementLabel,
    wrapperRef,
  ]);

  return {
    placementActive: pendingPlacement !== null,
    placementPreview,
    beginNodePlacement,
    updateNodePlacementClientPosition: setPlacementClientPosition,
    cancelNodePlacement,
    commitNodePlacementAtClientPosition,
  };
}
