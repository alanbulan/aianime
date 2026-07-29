// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { UploadImageNodeData } from '@/features/canvas/domain/canvasNodes';
import { useUploadNodeController } from '@/features/canvas/hooks/useUploadNodeController';

import { UploadNodeView } from './UploadNodeView';

type UploadNodeProps = NodeProps & {
  id: string;
  data: UploadImageNodeData;
  selected?: boolean;
};

export const UploadNode = memo((props: UploadNodeProps) => {
  const controller = useUploadNodeController(props);
  return createElement(UploadNodeView, { controller });
});

UploadNode.displayName = 'UploadNode';
