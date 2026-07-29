// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { AudioNodeData } from '@/features/canvas/domain/canvasNodes';
import { useAudioNodeController } from '@/features/canvas/hooks/useAudioNodeController';

import { AudioNodeView } from './AudioNodeView';

type AudioNodeProps = NodeProps & {
  id: string;
  data: AudioNodeData;
  selected?: boolean;
};

export const AudioNode = memo((props: AudioNodeProps) => {
  const controller = useAudioNodeController(props);
  return createElement(AudioNodeView, { controller });
});

AudioNode.displayName = 'AudioNode';
