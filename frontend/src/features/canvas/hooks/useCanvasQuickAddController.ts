// Copyright (c) 2026 AI anime
import {
  useCallback,
  type RefObject,
} from 'react';

import type { SkillDefinition } from '@/features/freezone/public';

import { createCanvasSkillNodeData } from '../application/canvasNodeMenuSelection';
import {
  CANVAS_NODE_TYPES,
  type CanvasNodeData,
  type CanvasNodeType,
} from '../domain/canvasNodes';

export interface CanvasQuickAddControllerOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  screenToFlowPosition: (
    clientPosition: { x: number; y: number },
  ) => { x: number; y: number };
  createNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    initialData?: Partial<CanvasNodeData>,
  ) => string;
  selectNode: (nodeId: string) => void;
  bindSkill: (nodeId: string, skill: SkillDefinition) => void;
}

export interface CanvasQuickAddController {
  getViewportCenter: () => { x: number; y: number };
  quickAddNode: (type: CanvasNodeType) => void;
  quickAddSkill: (skill: SkillDefinition) => void;
}

export function useCanvasQuickAddController({
  wrapperRef,
  screenToFlowPosition,
  createNode,
  selectNode,
  bindSkill,
}: CanvasQuickAddControllerOptions): CanvasQuickAddController {
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
    (type: CanvasNodeType) => {
      selectNode(createNode(type, getViewportCenter()));
    },
    [createNode, getViewportCenter, selectNode],
  );

  const quickAddSkill = useCallback(
    (skill: SkillDefinition) => {
      const nodeId = createNode(
        CANVAS_NODE_TYPES.skill,
        getViewportCenter(),
        createCanvasSkillNodeData(skill),
      );
      selectNode(nodeId);
      bindSkill(nodeId, skill);
    },
    [bindSkill, createNode, getViewportCenter, selectNode],
  );

  return {
    getViewportCenter,
    quickAddNode,
    quickAddSkill,
  };
}
