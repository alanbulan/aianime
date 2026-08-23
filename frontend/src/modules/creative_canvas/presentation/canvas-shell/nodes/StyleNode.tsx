// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import { useStyleNodeController } from '@/modules/creative_canvas/canvasComposition';
import {
  StyleNodeView,
  type StyleNodeData,
} from '@/modules/creative_canvas/public';

type StyleNodeProps = NodeProps & {
  id: string;
  data: StyleNodeData;
  selected?: boolean;
  projectId: string;
};

export const StyleNode = memo((props: StyleNodeProps) => {
  const controller = useStyleNodeController(props);
  return createElement(StyleNodeView, { controller });
});

StyleNode.displayName = 'StyleNode';
