// Copyright (c) 2026 AI anime
import { RefreshCw, Send, Trash2 } from "lucide-react";

import { UiChipButton } from "@/components/ui";
import type { NodeManagementToolbarController } from "@/features/canvas/hooks/useNodeManagementToolbarController";

import {
  NODE_ACTION_TOOLBAR_BUTTON_RADIUS_CLASS,
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
} from "@/modules/creative_canvas/public";

export interface NodeManagementToolbarActionsViewProps {
  controller: NodeManagementToolbarController;
}

export function NodeManagementToolbarActionsView({
  controller,
}: NodeManagementToolbarActionsViewProps) {
  const {
    t,
    projectionKey,
    projectionIsStale,
    removalTarget,
    canCommit,
    syncProjection,
    remove,
    commit,
  } = controller;

  return (
    <>
      {projectionKey && (
        <UiChipButton
          className={
            projectionIsStale
              ? `${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} !border-warning/50 !bg-warning/10 !text-warning hover:!bg-warning/15`
              : NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS
          }
          title={
            projectionIsStale
              ? t("freezone.projections.staleBadge")
              : undefined
          }
          onClick={(event) => {
            event.stopPropagation();
            syncProjection();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {projectionIsStale
            ? t("freezone.projections.syncStale")
            : t("freezone.projections.sync")}
        </UiChipButton>
      )}
      {removalTarget && (
        <UiChipButton
          className={`h-9 ${NODE_ACTION_TOOLBAR_BUTTON_RADIUS_CLASS} !border-transparent !bg-transparent px-3 text-sm text-destructive hover:!bg-destructive/10 hover:!text-destructive`}
          onClick={(event) => {
            event.stopPropagation();
            remove();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {removalTarget === "projection"
            ? t("freezone.projections.remove")
            : t("common.delete")}
        </UiChipButton>
      )}
      {canCommit && (
        <UiChipButton
          className={NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS}
          onClick={(event) => {
            event.stopPropagation();
            commit();
          }}
          title="把当前节点的内容写回主流程资产"
        >
          <Send className="h-3.5 w-3.5" />
          提交
        </UiChipButton>
      )}
    </>
  );
}
