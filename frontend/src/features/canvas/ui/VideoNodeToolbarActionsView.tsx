// Copyright (c) 2026 AI anime
import {
  ChevronDown,
  Crop,
  Download,
  Eraser,
  ImageUpscale,
  Loader2,
  Maximize2,
  Scissors,
  Video as VideoIcon,
  Wand2,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { UiChipButton } from "@/components/ui";
import type { VideoNodeToolbarController } from "@/features/canvas/hooks/useVideoNodeToolbarController";

import {
  NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS,
  NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS,
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
} from "@/modules/creative_canvas/public";

export interface VideoNodeToolbarActionsViewProps {
  controller: VideoNodeToolbarController;
}

export function VideoNodeToolbarActionsView({
  controller,
}: VideoNodeToolbarActionsViewProps) {
  const {
    t,
    hasVideo,
    isAnalyzing,
    isSeparatingAudioVideo,
    toggleClipMode,
    createUpscaleNode,
    analyze,
    openSubtitleRemoval,
    separateAudioVideo,
    download,
    openFullscreen,
  } = controller;
  const unavailableClass = hasVideo ? "" : "opacity-50 cursor-not-allowed";
  const unavailableTitle = hasVideo
    ? undefined
    : t("nodeToolbar.video.requiresVideo");

  return (
    <>
      <UiChipButton
        className={`${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} ${unavailableClass}`}
        title={unavailableTitle}
        onClick={(event) => {
          event.stopPropagation();
          toggleClipMode();
        }}
      >
        <Scissors className="h-3.5 w-3.5" />
        {t("nodeToolbar.video.clip")}
      </UiChipButton>
      <UiChipButton
        className={`${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} ${unavailableClass}`}
        title={unavailableTitle}
        onClick={(event) => {
          event.stopPropagation();
          createUpscaleNode();
        }}
      >
        <ImageUpscale className="h-3.5 w-3.5" />
        {t("nodeToolbar.video.hd")}
      </UiChipButton>
      <UiChipButton
        className={`${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} ${unavailableClass}`}
        title={unavailableTitle}
        onClick={(event) => {
          event.stopPropagation();
          void analyze();
        }}
      >
        {isAnalyzing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Wand2 className="h-3.5 w-3.5" />
        )}
        {t("nodeToolbar.video.analyze")}
      </UiChipButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <UiChipButton
            className={NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS}
            title={t("nodeToolbar.video.subtitleRemovalTip")}
            onClick={(event) => event.stopPropagation()}
          >
            <Eraser className="h-3.5 w-3.5" />
            {t("nodeToolbar.video.subtitleRemoval")}
            <ChevronDown className="h-3 w-3" />
          </UiChipButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className={`${NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS} min-w-[180px]`}
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuItem
            className={NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS}
            onSelect={() => openSubtitleRemoval("smart")}
          >
            <Wand2 className="h-4 w-4" />
            {t("nodeToolbar.video.subtitleRemovalSmart")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS}
            onSelect={() => openSubtitleRemoval("box")}
          >
            <Crop className="h-4 w-4" />
            {t("nodeToolbar.video.subtitleRemovalBox")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <UiChipButton
        className={`${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} ${
          !hasVideo || isSeparatingAudioVideo
            ? "opacity-50 cursor-not-allowed"
            : ""
        }`}
        title={unavailableTitle}
        onClick={(event) => {
          event.stopPropagation();
          void separateAudioVideo();
        }}
      >
        {isSeparatingAudioVideo ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <VideoIcon className="h-3.5 w-3.5" />
        )}
        {t("nodeToolbar.video.separateAudioVideo")}
      </UiChipButton>
      <UiChipButton
        className={`${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} !px-2 ${unavailableClass}`}
        title={
          hasVideo
            ? t("nodeToolbar.download")
            : t("nodeToolbar.video.requiresVideo")
        }
        onClick={(event) => {
          event.stopPropagation();
          void download();
        }}
      >
        <Download className="h-3.5 w-3.5" />
      </UiChipButton>
      <UiChipButton
        className={`${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} !px-2 ${unavailableClass}`}
        title={
          hasVideo
            ? t("nodeToolbar.video.fullscreen")
            : t("nodeToolbar.video.requiresVideo")
        }
        onClick={(event) => {
          event.stopPropagation();
          openFullscreen();
        }}
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </UiChipButton>
    </>
  );
}
