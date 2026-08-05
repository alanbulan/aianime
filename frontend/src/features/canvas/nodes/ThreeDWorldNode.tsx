// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

;
import { useThreeDWorldNodeController } from '@/features/canvas/hooks/useThreeDWorldNodeController';

import { ThreeDWorldNodeView } from './ThreeDWorldNodeView';

import type { ThreeDWorldNodeData } from "@/modules/creative_canvas/public";
type ThreeDWorldNodeProps = NodeProps & {
  id: string;
  data: ThreeDWorldNodeData;
  selected?: boolean;
  projectId: string;
  canvasId: string;
};

export const ThreeDWorldNode = memo((props: ThreeDWorldNodeProps) => {
  const controller = useThreeDWorldNodeController(props);
  return createElement(ThreeDWorldNodeView, { controller });
});

ThreeDWorldNode.displayName = 'ThreeDWorldNode';
