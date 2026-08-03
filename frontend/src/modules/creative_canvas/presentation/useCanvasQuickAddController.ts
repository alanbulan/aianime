// Copyright (c) 2026 AI anime
import {
  useCallback,
  type RefObject,
} from 'react';

import { createCanvasSkillNodeData } from '@/modules/creative_canvas/application/canvasNodeMenuSelection';
import type { CanvasNodeMenuCreationData } from '@/modules/creative_canvas/application/canvasNodeMenuSelection';
import type { SkillDefinition } from '@/modules/creative_canvas/domain/skillContract';

export interface CanvasQuickAddControllerOptions<
  TNodeType extends string = string,
> {
  wrapperRef: RefObject<HTMLDivElement | null>;
  screenToFlowPosition: (
    clientPosition: { x: number; y: number },
  ) => { x: number; y: number };
  createNode: (
    type: TNodeType,
    position: { x: number; y: number },
    initialData?: CanvasNodeMenuCreationData,
  ) => string;
  selectNode: (nodeId: string) => void;
  bindSkill: (nodeId: string, skill: SkillDefinition) => void;
  skillNodeType: TNodeType;
}

export interface CanvasQuickAddController<
  TNodeType extends string = string,
> {
  getViewportCenter: () => { x: number; y: number };
  quickAddNode: (type: TNodeType) => void;
  quickAddSkill: (skill: SkillDefinition) => void;
}

export function useCanvasQuickAddController<
  TNodeType extends string,
>({
  wrapperRef,
  screenToFlowPosition,
  createNode,
  selectNode,
  bindSkill,
  skillNodeType,
}: CanvasQuickAddControllerOptions<TNodeType>): CanvasQuickAddController<TNodeType> {
  const getViewportCenter = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = rect
      ? {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        }
      : {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        };
    return screenToFlowPosition(center);
  }, [screenToFlowPosition, wrapperRef]);

  const quickAddNode = useCallback(
    (type: TNodeType) => {
      selectNode(createNode(type, getViewportCenter()));
    },
    [createNode, getViewportCenter, selectNode],
  );

  const quickAddSkill = useCallback(
    (skill: SkillDefinition) => {
      const nodeId = createNode(
        skillNodeType,
        getViewportCenter(),
        createCanvasSkillNodeData(skill),
      );
      selectNode(nodeId);
      bindSkill(nodeId, skill);
    },
    [bindSkill, createNode, getViewportCenter, selectNode, skillNodeType],
  );

  return {
    getViewportCenter,
    quickAddNode,
    quickAddSkill,
  };
}
