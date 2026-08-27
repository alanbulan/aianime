// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { useVideoStoryNodeController } from '@/modules/creative_canvas/canvasComposition';
import {
  VideoStoryNodeView,
  type VideoStoryNodeData,
} from '@/modules/creative_canvas/presentation/canvas-shell/internal';
type VideoStoryNodeProps = NodeProps & {
  id: string;
  data: VideoStoryNodeData;
  selected?: boolean;
};

export const VideoStoryNode = memo((props: VideoStoryNodeProps) => {
  const controller = useVideoStoryNodeController(props);
  return createElement(VideoStoryNodeView, { controller });
});

VideoStoryNode.displayName = 'VideoStoryNode';
