// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { useVideoNodeController } from '@/modules/creative_canvas/canvasComposition';
import {
  VideoNodeView,
  type VideoNodeData,
} from '@/modules/creative_canvas/presentation/canvas-shell/internal';

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
