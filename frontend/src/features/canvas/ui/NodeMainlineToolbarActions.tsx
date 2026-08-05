// Copyright (c) 2026 AI anime
import { memo } from "react";

;
import { useNodeMainlineToolbarController } from "@/features/canvas/hooks/useNodeMainlineToolbarController";
import { NodeMainlineToolbarActionsView, type CanvasNode } from "@/modules/creative_canvas/public";

export interface NodeMainlineToolbarActionsProps {
  projectId: string;
  node: CanvasNode;
  isPresetLocked: boolean;
}

export const NodeMainlineToolbarActions = memo(
  (props: NodeMainlineToolbarActionsProps) => {
    const controller = useNodeMainlineToolbarController(props);
    return <NodeMainlineToolbarActionsView controller={controller} />;
  },
);

NodeMainlineToolbarActions.displayName = "NodeMainlineToolbarActions";
