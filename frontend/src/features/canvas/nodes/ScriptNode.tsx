// Copyright (c) 2026 AI anime
import { createElement, memo } from 'react';
import type { NodeProps } from '@xyflow/react';

;
import { useScriptNodeController } from '@/features/canvas/hooks/useScriptNodeController';

import { ScriptNodeView } from './ScriptNodeView';

import type { ScriptNodeData } from "@/modules/creative_canvas/public";
type ScriptNodeProps = NodeProps & {
  id: string;
  data: ScriptNodeData;
  selected?: boolean;
  projectId: string;
  canvasId: string;
};

export const ScriptNode = memo((props: ScriptNodeProps) => {
  const controller = useScriptNodeController(props);
  return createElement(ScriptNodeView, { controller });
});

ScriptNode.displayName = 'ScriptNode';
