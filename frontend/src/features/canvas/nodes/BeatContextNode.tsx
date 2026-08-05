// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

;
import { useBeatContextNodeController } from '@/features/canvas/hooks/useBeatContextNodeController';

import { BeatContextNodeView } from './BeatContextNodeView';

import type { BeatContextNodeData } from "@/modules/creative_canvas/public";
type BeatContextNodeProps = NodeProps & {
  id: string;
  data: BeatContextNodeData;
  projectId: string;
  canvasId: string;
  selected?: boolean;
};

export const BeatContextNode = memo((props: BeatContextNodeProps) => {
  const controller = useBeatContextNodeController(props);
  return createElement(BeatContextNodeView, { controller });
});

BeatContextNode.displayName = 'BeatContextNode';
