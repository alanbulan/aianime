// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

;
import { useStoryboardNodeController } from '@/features/canvas/hooks/useStoryboardNodeController';

import { StoryboardNodeView } from './StoryboardNodeView';

import type { StoryboardSplitNodeData } from "@/modules/creative_canvas/public";
type StoryboardNodeProps = NodeProps & {
  projectId: string;
  id: string;
  data: StoryboardSplitNodeData;
  selected?: boolean;
};

export const StoryboardNode = memo((props: StoryboardNodeProps) => {
  const controller = useStoryboardNodeController(props);
  return createElement(StoryboardNodeView, { controller });
});

StoryboardNode.displayName = 'StoryboardNode';
