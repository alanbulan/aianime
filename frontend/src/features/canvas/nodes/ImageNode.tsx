// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type {
  ExportImageNodeData,
  ImageEditNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { useImageNodeController } from '@/features/canvas/hooks/useImageNodeController';

import { ImageNodeView } from './ImageNodeView';

type ImageNodeProps = NodeProps & {
  projectId: string;
  canvasId: string;
  id: string;
  data: ImageEditNodeData | ExportImageNodeData;
  selected?: boolean;
};

export const ImageNode = memo((props: ImageNodeProps) => {
  const controller = useImageNodeController(props);
  return createElement(ImageNodeView, { controller });
});

ImageNode.displayName = 'ImageNode';
