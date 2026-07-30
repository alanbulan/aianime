// Copyright (c) 2026 AI anime
import { ChevronDown, Download, Loader2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { UiChipButton } from "@/components/ui";
import type { AudioNodeToolbarController } from "@/features/canvas/hooks/useAudioNodeToolbarController";

import {
  NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS,
  NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS,
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
} from "./nodeActionToolbarStyles";

export interface AudioNodeToolbarActionsViewProps {
  controller: AudioNodeToolbarController;
}

export function AudioNodeToolbarActionsView({
  controller,
}: AudioNodeToolbarActionsViewProps) {
  const {
    t,
    hasAudio,
    convertingFormat,
    isConverting,
    formatOptions,
    download,
  } = controller;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <UiChipButton
          className={`${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} ${
            hasAudio ? "" : "opacity-50 cursor-not-allowed"
          }`}
          title={
            hasAudio
              ? t("nodeToolbar.download")
              : t("nodeToolbar.audio.requiresAudio")
          }
          onClick={(event) => event.stopPropagation()}
        >
          {isConverting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {t("nodeToolbar.download")}
          <ChevronDown className="h-3 w-3" />
        </UiChipButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={`${NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS} min-w-[170px]`}
        onClick={(event) => event.stopPropagation()}
      >
        {formatOptions.map(({ format, available }) => (
          <DropdownMenuItem
            key={format}
            disabled={!hasAudio || !available || isConverting}
            className={NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS}
            onSelect={() => {
              void download(format);
            }}
          >
            {convertingFormat === format ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="flex-1">
              {t("nodeToolbar.audio.downloadAs", {
                format: format.toUpperCase(),
              })}
            </span>
            {!available ? (
              <span className="text-[10px] opacity-60">
                {t("nodeToolbar.audio.m4aSourceOnlyHint")}
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
