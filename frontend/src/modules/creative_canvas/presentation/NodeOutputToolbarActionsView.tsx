// Copyright (c) 2026 AI anime
import { Copy, Download } from "lucide-react";
import type { TFunction } from "i18next";

import { UiChipButton } from "@/components/ui";
import {
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
} from "./canvasNodeActionToolbarStyles";
import { NodeToolbarIconChip } from "./NodeToolbarIconChip";

export interface NodeOutputToolbarViewState {
  t: TFunction;
  canCopyStoryboardText: boolean;
  canCopyGenerationError: boolean;
  canDownloadImage: boolean;
  isCopyTextSuccess: boolean;
  isCopyErrorSuccess: boolean;
  copyStoryboardText(): Promise<void>;
  copyGenerationError(): Promise<void>;
  downloadImage(): Promise<void>;
}

export interface NodeOutputToolbarActionsViewProps {
  controller: NodeOutputToolbarViewState;
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
