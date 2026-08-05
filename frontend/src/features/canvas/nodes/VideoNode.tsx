// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

;
import { useVideoNodeController } from '@/features/canvas/hooks/useVideoNodeController';

import { VideoNodeView } from './VideoNodeView';

import type { VideoNodeData } from "@/modules/creative_canvas/public";
type VideoNodeProps = NodeProps & {
  id: string;
  data: VideoNodeData;
  selected?: boolean;
  projectId: string;
  canvasId: string;
};

export const VideoNode = memo((props: VideoNodeProps) => {
  const controller = useVideoNodeController(props);
  return createElement(VideoNodeView, { controller });
});

VideoNode.displayName = 'VideoNode';
