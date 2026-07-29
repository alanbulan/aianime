// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { VideoComposeNodeData } from '@/features/canvas/domain/canvasNodes';
import { useVideoComposeNodeController } from '@/features/canvas/hooks/useVideoComposeNodeController';

import { VideoComposeNodeView } from './VideoComposeNodeView';

type VideoComposeNodeProps = NodeProps & {
  id: string;
  data: VideoComposeNodeData;
  selected?: boolean;
};

export const VideoComposeNode = memo((props: VideoComposeNodeProps) => {
  const controller = useVideoComposeNodeController(props);
  return createElement(VideoComposeNodeView, { controller });
});

VideoComposeNode.displayName = 'VideoComposeNode';
