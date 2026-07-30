// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { ImageGenNodeData } from '@/features/canvas/domain/canvasNodes';
import { useImageGenNodeController } from '@/features/canvas/hooks/useImageGenNodeController';

import { ImageGenNodeView } from './ImageGenNodeView';

type ImageGenNodeProps = NodeProps & {
  id: string;
  data: ImageGenNodeData;
  selected?: boolean;
};

export const ImageGenNode = memo((props: ImageGenNodeProps) => {
  const controller = useImageGenNodeController(props);
  return createElement(ImageGenNodeView, { controller });
});

ImageGenNode.displayName = 'ImageGenNode';
