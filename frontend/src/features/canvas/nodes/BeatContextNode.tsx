// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { BeatContextNodeData } from '@/features/canvas/domain/canvasNodes';
import { useBeatContextNodeController } from '@/features/canvas/hooks/useBeatContextNodeController';

import { BeatContextNodeView } from './BeatContextNodeView';

type BeatContextNodeProps = NodeProps & {
  id: string;
  data: BeatContextNodeData;
  selected?: boolean;
};

export const BeatContextNode = memo((props: BeatContextNodeProps) => {
  const controller = useBeatContextNodeController(props);
  return createElement(BeatContextNodeView, { controller });
});

BeatContextNode.displayName = 'BeatContextNode';
