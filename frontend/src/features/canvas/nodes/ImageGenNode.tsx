// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

;
import { useImageGenNodeController } from '@/features/canvas/hooks/useImageGenNodeController';

import { ImageGenNodeView } from './ImageGenNodeView';

import type { ImageGenNodeData } from "@/modules/creative_canvas/public";
type ImageGenNodeProps = NodeProps & {
  id: string;
  data: ImageGenNodeData;
  selected?: boolean;
  projectId: string;
  canvasId: string;
};

export const ImageGenNode = memo((props: ImageGenNodeProps) => {
  const controller = useImageGenNodeController(props);
  return createElement(ImageGenNodeView, { controller });
});

ImageGenNode.displayName = 'ImageGenNode';
