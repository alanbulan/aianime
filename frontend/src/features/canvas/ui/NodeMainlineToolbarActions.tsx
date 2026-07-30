// Copyright (c) 2026 AI anime
import { memo } from "react";

import type { CanvasNode } from "@/features/canvas/domain/canvasNodes";
import { useNodeMainlineToolbarController } from "@/features/canvas/hooks/useNodeMainlineToolbarController";

import { NodeMainlineToolbarActionsView } from "./NodeMainlineToolbarActionsView";

export interface NodeMainlineToolbarActionsProps {
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
