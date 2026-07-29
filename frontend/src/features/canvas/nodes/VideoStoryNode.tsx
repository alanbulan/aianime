// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { VideoStoryNodeData } from '@/features/canvas/domain/canvasNodes';
import { useVideoStoryNodeController } from '@/features/canvas/hooks/useVideoStoryNodeController';

import { VideoStoryNodeView } from './VideoStoryNodeView';

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
