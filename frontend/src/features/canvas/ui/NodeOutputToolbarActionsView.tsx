// Copyright (c) 2026 AI anime
import { Copy, Download } from "lucide-react";

import { UiChipButton } from "@/components/ui";
import type { NodeOutputToolbarController } from "@/features/canvas/hooks/useNodeOutputToolbarController";

import {
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
  NodeToolbarIconChip,
} from "@/modules/creative_canvas/public";

export interface NodeOutputToolbarActionsViewProps {
  controller: NodeOutputToolbarController;
}

export function NodeOutputToolbarActionsView({
  controller,
}: NodeOutputToolbarActionsViewProps) {
  const {
    t,
    canCopyStoryboardText,
    canCopyGenerationError,
    canDownloadImage,
    isCopyTextSuccess,
    isCopyErrorSuccess,
    copyStoryboardText,
    copyGenerationError,
    downloadImage,
  } = controller;

  return (
    <>
      {canCopyStoryboardText && (
        <UiChipButton
          className={`${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} ${
            isCopyTextSuccess
              ? "!border-success/45 !bg-success/10 !text-success hover:!bg-success/15"
              : ""
          }`}
          onClick={() => {
            void copyStoryboardText();
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          {t("nodeToolbar.copyText")}
        </UiChipButton>
      )}
      {canCopyGenerationError && (
        <UiChipButton
          className={`${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} ${
            isCopyErrorSuccess
              ? "!border-success/45 !bg-success/10 !text-success hover:!bg-success/15"
              : "!border-destructive/45 !bg-destructive/10 !text-destructive hover:!bg-destructive/15"
          }`}
          onClick={() => {
            void copyGenerationError();
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          {isCopyErrorSuccess
            ? t("nodeToolbar.copied")
            : t("nodeToolbar.copyErrorReport")}
        </UiChipButton>
      )}
      {canDownloadImage && (
        <NodeToolbarIconChip
          label={t("nodeToolbar.download")}
          icon={Download}
          onClick={(event) => {
            event.stopPropagation();
            void downloadImage();
          }}
        />
      )}
    </>
  );
}
