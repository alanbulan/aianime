// Copyright (c) 2026 AI anime
import { memo } from "react";

;
import { useNodeManagementToolbarController } from "@/features/canvas/hooks/useNodeManagementToolbarController";
import { NodeManagementToolbarActionsView, type CanvasNode } from "@/modules/creative_canvas/public";

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
