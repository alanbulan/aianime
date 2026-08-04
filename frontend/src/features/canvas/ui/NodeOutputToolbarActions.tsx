// Copyright (c) 2026 AI anime
import { memo } from "react";

import type { CanvasNode } from "@/features/canvas/domain/canvasNodes";
import { useNodeOutputToolbarController } from "@/features/canvas/hooks/useNodeOutputToolbarController";
import { NodeOutputToolbarActionsView } from "@/modules/creative_canvas/public";

export interface NodeOutputToolbarActionsProps {
  node: CanvasNode;
}

export const NodeOutputToolbarActions = memo(
  (props: NodeOutputToolbarActionsProps) => {
    const controller = useNodeOutputToolbarController(props);
    return <NodeOutputToolbarActionsView controller={controller} />;
  },
);

NodeOutputToolbarActions.displayName = "NodeOutputToolbarActions";
