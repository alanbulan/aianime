// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { useStoryboardGenNodeController } from '@/modules/creative_canvas/canvasComposition';
import {
  StoryboardGenNodeView,
  type StoryboardGenNodeData,
} from '@/modules/creative_canvas/public';

type StoryboardGenNodeProps = NodeProps & {
  id: string;
  data: StoryboardGenNodeData;
  selected?: boolean;
  projectId: string;
  canvasId: string;
};

export const StoryboardGenNode = memo((props: StoryboardGenNodeProps) => {
  const controller = useStoryboardGenNodeController(props);
  return createElement(StoryboardGenNodeView, { controller });
});

StoryboardGenNode.displayName = 'StoryboardGenNode';
