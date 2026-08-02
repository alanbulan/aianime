// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { GroupNodeData } from '@/features/canvas/domain/canvasNodes';
import { useGroupNodeController } from '@/features/canvas/hooks/useGroupNodeController';

import { GroupNodeView } from './GroupNodeView';

type GroupNodeProps = NodeProps & {
  id: string;
  data: GroupNodeData;
  projectId: string;
  selected?: boolean;
};

export const GroupNode = memo((props: GroupNodeProps) => {
  const controller = useGroupNodeController(props);
  return createElement(GroupNodeView, { controller });
});

GroupNode.displayName = 'GroupNode';
