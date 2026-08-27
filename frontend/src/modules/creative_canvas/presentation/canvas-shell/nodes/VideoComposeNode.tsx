// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { useVideoComposeNodeController } from '@/modules/creative_canvas/canvasComposition';
import {
  VideoComposeNodeView,
  type VideoComposeNodeData,
} from '@/modules/creative_canvas/presentation/canvas-shell/internal';
type VideoComposeNodeProps = NodeProps & {
  id: string;
  data: VideoComposeNodeData;
  projectId: string;
  canvasId: string;
  selected?: boolean;
};

export const VideoComposeNode = memo((props: VideoComposeNodeProps) => {
  const controller = useVideoComposeNodeController(props);
  return createElement(VideoComposeNodeView, { controller });
});

VideoComposeNode.displayName = 'VideoComposeNode';
