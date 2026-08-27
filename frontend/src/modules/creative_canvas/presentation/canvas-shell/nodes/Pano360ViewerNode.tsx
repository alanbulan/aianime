// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { usePano360ViewerNodeController } from '@/modules/creative_canvas/canvasComposition';
import {
  Pano360ViewerNodeView,
  type Pano360ViewerNodeData,
} from '@/modules/creative_canvas/presentation/canvas-shell/internal';

type Pano360ViewerNodeProps = NodeProps & {
  projectId: string;
  id: string;
  data: Pano360ViewerNodeData;
  selected?: boolean;
};

export const Pano360ViewerNode = memo((props: Pano360ViewerNodeProps) => {
  const controller = usePano360ViewerNodeController(props);
  return createElement(Pano360ViewerNodeView, { controller });
});

Pano360ViewerNode.displayName = 'Pano360ViewerNode';
