// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { useUploadNodeController } from '@/modules/creative_canvas/canvasComposition';
import {
  UploadNodeView,
  type UploadImageNodeData,
} from '@/modules/creative_canvas/presentation/canvas-shell/internal';
type UploadNodeProps = NodeProps & {
  id: string;
  data: UploadImageNodeData;
  selected?: boolean;
  projectId: string;
};

export const UploadNode = memo((props: UploadNodeProps) => {
  const controller = useUploadNodeController(props);
  return createElement(UploadNodeView, { controller });
});

UploadNode.displayName = 'UploadNode';
