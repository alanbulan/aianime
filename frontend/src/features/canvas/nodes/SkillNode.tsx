// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { SkillNodeData } from '@/features/canvas/domain/canvasNodes';
import { useSkillNodeController } from '@/features/canvas/hooks/useSkillNodeController';

import { SkillNodeView } from './SkillNodeView';

type SkillNodeProps = NodeProps & {
  id: string;
  data: SkillNodeData;
  selected?: boolean;
};

export const SkillNode = memo((props: SkillNodeProps) => {
  const controller = useSkillNodeController(props);
  return createElement(SkillNodeView, { controller });
});

SkillNode.displayName = 'SkillNode';
