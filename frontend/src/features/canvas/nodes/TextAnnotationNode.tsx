// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { TextAnnotationNodeData } from '@/features/canvas/domain/canvasNodes';
import { useTextAnnotationNodeController } from '@/features/canvas/hooks/useTextAnnotationNodeController';

import { TextAnnotationNodeView } from './TextAnnotationNodeView';

type TextAnnotationNodeProps = NodeProps & {
  id: string;
  data: TextAnnotationNodeData;
  selected?: boolean;
};

export const TextAnnotationNode = memo((props: TextAnnotationNodeProps) => {
  const controller = useTextAnnotationNodeController(props);
  return createElement(TextAnnotationNodeView, { controller });
});

TextAnnotationNode.displayName = 'TextAnnotationNode';
