// Copyright (c) 2026 AI anime
import { memo } from "react";

import type { CanvasNode } from "@/features/canvas/domain/canvasNodes";
import { useNodeManagementToolbarController } from "@/features/canvas/hooks/useNodeManagementToolbarController";

import { NodeManagementToolbarActionsView } from "./NodeManagementToolbarActionsView";

export interface NodeManagementToolbarActionsProps {
  node: CanvasNode;
}

export const NodeManagementToolbarActions = memo(
  (props: NodeManagementToolbarActionsProps) => {
    const controller = useNodeManagementToolbarController(props);
    return <NodeManagementToolbarActionsView controller={controller} />;
  },
);

NodeManagementToolbarActions.displayName = "NodeManagementToolbarActions";
