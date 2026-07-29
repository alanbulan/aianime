// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { ImageEditNodeData } from '@/features/canvas/domain/canvasNodes';
import { useImageEditNodeController } from '@/features/canvas/hooks/useImageEditNodeController';

import { ImageEditNodeView } from './ImageEditNodeView';

type ImageEditNodeProps = NodeProps & {
  id: string;
  data: ImageEditNodeData;
  selected?: boolean;
};

export const ImageEditNode = memo((props: ImageEditNodeProps) => {
  const controller = useImageEditNodeController(props);
  return createElement(ImageEditNodeView, { controller });
});

ImageEditNode.displayName = 'ImageEditNode';
