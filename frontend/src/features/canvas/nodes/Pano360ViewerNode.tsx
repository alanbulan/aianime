// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

;
import { usePano360ViewerNodeController } from '@/features/canvas/hooks/usePano360ViewerNodeController';

import { Pano360ViewerNodeView } from './Pano360ViewerNodeView';

import type { Pano360ViewerNodeData } from "@/modules/creative_canvas/public";
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
