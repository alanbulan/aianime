// Copyright (c) 2026 AI anime
import { FolderOpen, Link2 } from "lucide-react";

import { UiChipButton } from "@/components/ui";
import type { NodeMainlineToolbarController } from "@/features/canvas/hooks/useNodeMainlineToolbarController";

import {
  NODE_ACTION_TOOLBAR_BUTTON_RADIUS_CLASS,
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
} from "@/modules/creative_canvas/public";

export interface NodeMainlineToolbarActionsViewProps {
  controller: NodeMainlineToolbarController;
}

export function NodeMainlineToolbarActionsView({
  controller,
}: NodeMainlineToolbarActionsViewProps) {
  const {
    isPresetLocked,
    canOpenWorkbench,
    canEnsureBeatContext,
    openingWorkbench,
    openWorkbench,
    ensureBeatContextNode,
  } = controller;

  return (
    <>
      {isPresetLocked && (
        <span className="rounded-full border border-warning/35 bg-warning/10 px-3 py-1.5 text-sm text-warning">
          主线投影 · 锁定
        </span>
      )}
      {canOpenWorkbench && (
        <UiChipButton
          className={`h-9 ${NODE_ACTION_TOOLBAR_BUTTON_RADIUS_CLASS} border-primary/45 bg-primary/10 px-3 text-sm text-primary hover:bg-primary/15 disabled:opacity-50`}
          disabled={openingWorkbench}
          onClick={(event) => {
            event.stopPropagation();
            openWorkbench();
          }}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {openingWorkbench ? "打开中..." : "打开工作台"}
        </UiChipButton>
      )}
      {canEnsureBeatContext && (
        <UiChipButton
          className={NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS}
          title="创建或定位这个素材对应的镜头上下文节点；不会自动连线"
          onClick={(event) => {
            event.stopPropagation();
            ensureBeatContextNode();
          }}
        >
          <Link2 className="h-3.5 w-3.5" />
          镜头上下文
        </UiChipButton>
      )}
    </>
  );
}
