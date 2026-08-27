// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { useTextAnnotationNodeController } from '@/modules/creative_canvas/canvasComposition';
import {
  TextAnnotationNodeView,
  type TextAnnotationNodeData,
} from '@/modules/creative_canvas/presentation/canvas-shell/internal';
type TextAnnotationNodeProps = NodeProps & {
  id: string;
  data: TextAnnotationNodeData;
  selected?: boolean;
  projectId: string;
  canvasId: string;
};

export const TextAnnotationNode = memo((props: TextAnnotationNodeProps) => {
  const controller = useTextAnnotationNodeController(props);
  return createElement(TextAnnotationNodeView, { controller });
});

TextAnnotationNode.displayName = 'TextAnnotationNode';
