// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { useSkillNodeController } from '@/modules/creative_canvas/canvasComposition';
import {
  SkillNodeView,
  type SkillNodeData,
} from '@/modules/creative_canvas/public';

type SkillNodeProps = NodeProps & {
  id: string;
  data: SkillNodeData;
  projectId: string;
  canvasId: string;
  selected?: boolean;
};

export const SkillNode = memo((props: SkillNodeProps) => {
  const controller = useSkillNodeController(props);
  return createElement(SkillNodeView, { controller });
});

SkillNode.displayName = 'SkillNode';
