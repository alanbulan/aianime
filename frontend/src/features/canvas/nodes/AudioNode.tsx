// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { useAudioNodeController } from '@/modules/creative_canvas/canvasComposition';
import {
  AudioNodeView,
  type AudioNodeData,
} from '@/modules/creative_canvas/public';
type AudioNodeProps = NodeProps & {
  projectId: string;
  canvasId: string;
  id: string;
  data: AudioNodeData;
  selected?: boolean;
};

export const AudioNode = memo((props: AudioNodeProps) => {
  const controller = useAudioNodeController(props);
  return createElement(AudioNodeView, { controller });
});

AudioNode.displayName = 'AudioNode';
