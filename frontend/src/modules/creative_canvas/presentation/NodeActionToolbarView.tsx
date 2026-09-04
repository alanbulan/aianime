// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { NodeToolbar as ReactFlowNodeToolbar } from "@xyflow/react";

import { UiPanel } from "@/components/ui";
import {
  NODE_TOOLBAR_ALIGN,
  NODE_TOOLBAR_CLASS,
  NODE_TOOLBAR_OFFSET,
  NODE_TOOLBAR_POSITION,
} from "./canvasNodeToolbarConfig";
import { ZoomScaledToolbar } from "./ZoomScaledToolbar";

export interface NodeActionToolbarViewProps {
  nodeId: string;
  storyboardGroupToolbar: ReactNode;
  actions: ReactNode;
}

export function NodeActionToolbarView({
  nodeId,
  storyboardGroupToolbar,
  actions,
}: NodeActionToolbarViewProps) {
  if (storyboardGroupToolbar) {
    return storyboardGroupToolbar;
  }

  return (
    <ReactFlowNodeToolbar
      nodeId={nodeId}
      isVisible
      position={NODE_TOOLBAR_POSITION}
      align={NODE_TOOLBAR_ALIGN}
      offset={NODE_TOOLBAR_OFFSET}
      className={NODE_TOOLBAR_CLASS}
    >
      <ZoomScaledToolbar origin="bottom center">
        <UiPanel className="flex animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 items-center gap-1.5 rounded-[18px] !border-border !bg-popover/95 px-2 py-1.5 text-sm shadow-xl backdrop-blur-2xl duration-200 ease-out motion-reduce:animate-none [&_svg]:h-4 [&_svg]:w-4">
          {actions}
        </UiPanel>
      </ZoomScaledToolbar>
    </ReactFlowNodeToolbar>
  );
}
