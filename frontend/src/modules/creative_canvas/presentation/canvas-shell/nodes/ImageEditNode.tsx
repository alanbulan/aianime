// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { useImageEditNodeController } from '@/modules/creative_canvas/canvasComposition';
import {
  ImageEditNodeView,
  type ImageEditNodeData,
} from '@/modules/creative_canvas/public';

type ImageEditNodeProps = NodeProps & {
  projectId: string;
  canvasId: string;
  id: string;
  data: ImageEditNodeData;
  selected?: boolean;
};

export const ImageEditNode = memo((props: ImageEditNodeProps) => {
  const controller = useImageEditNodeController(props);
  return createElement(ImageEditNodeView, { controller });
});

ImageEditNode.displayName = 'ImageEditNode';
