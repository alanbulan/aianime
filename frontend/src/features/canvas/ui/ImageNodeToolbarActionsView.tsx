// Copyright (c) 2026 AI anime
import {
  Boxes,
  Crop,
  Globe2,
  Lightbulb,
  PenLine,
  RotateCw,
  Scissors,
  type LucideIcon,
} from "lucide-react";

import { UiChipButton } from "@/components/ui";
import type { ToolIconKey } from "@/features/canvas/tools";
import type { ImageNodeToolbarController } from "@/features/canvas/hooks/useImageNodeToolbarController";

import { ImageEditToolbarActions } from "./ImageEditToolbarActions";
import { ImageGridToolbarActions } from "./ImageGridToolbarActions";
import { NodeToolbarIconChip } from "./NodeToolbarIconChip";
import { NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS } from "./nodeActionToolbarStyles";

const toolIconMap: Record<ToolIconKey, LucideIcon> = {
  crop: Crop,
  annotate: PenLine,
  split: Scissors,
};

export interface ImageNodeToolbarActionsViewProps {
  controller: ImageNodeToolbarController;
}

export function ImageNodeToolbarActionsView({
  controller,
}: ImageNodeToolbarActionsViewProps) {
  if (!controller.visible) return null;
  const {
    t,
    projectId,
    nodeId,
    nodeData,
    imageSource,
    isPresetLocked,
    canEdit,
    canRotate,
    toolActions,
    openPanorama,
    openMultiDimension,
    openRelight,
    openRotate,
    openTool,
    onOpenUpscale,
    onOpenOutpaint,
    onOpenGridAction,
    onOpenRedraw,
    onOpenErase,
  } = controller;

  return (
    <>
      <UiChipButton
        className={NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS}
        onClick={(event) => {
          event.stopPropagation();
          openPanorama();
        }}
      >
        <Globe2 className="h-3.5 w-3.5" />
        {t("nodeToolbar.panorama")}
      </UiChipButton>
      <UiChipButton
        className={NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS}
        onClick={(event) => {
          event.stopPropagation();
          openMultiDimension();
        }}
      >
        <Boxes className="h-3.5 w-3.5" />
        {t("nodeToolbar.multiDimension")}
      </UiChipButton>
      <UiChipButton
        className={NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS}
        onClick={(event) => {
          event.stopPropagation();
          openRelight();
        }}
      >
        <Lightbulb className="h-3.5 w-3.5" />
        {t("nodeToolbar.relight")}
      </UiChipButton>
      {canEdit && (
        <ImageEditToolbarActions
          projectId={projectId}
          nodeId={nodeId}
          nodeData={nodeData}
          imageSource={imageSource}
          isPresetLocked={isPresetLocked}
          onOpenRedraw={onOpenRedraw}
          onOpenErase={onOpenErase}
          onOpenUpscale={onOpenUpscale}
          onOpenOutpaint={onOpenOutpaint}
        />
      )}
      <ImageGridToolbarActions
        nodeId={nodeId}
        onOpenGridAction={onOpenGridAction}
      />
      <span
        aria-hidden
        className="mx-1 h-4 w-px shrink-0 self-center bg-border"
      />
      {toolActions.map((action) => {
        const Icon = toolIconMap[action.icon];
        return action.iconOnly ? (
          <NodeToolbarIconChip
            key={action.type}
            label={action.label}
            icon={Icon}
            onClick={() => openTool(action.type)}
          />
        ) : (
          <UiChipButton
            key={action.type}
            className={NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS}
            onClick={() => openTool(action.type)}
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </UiChipButton>
        );
      })}
      {canRotate && (
        <NodeToolbarIconChip
          label={t("nodeToolbar.rotate")}
          icon={RotateCw}
          onClick={(event) => {
            event.stopPropagation();
            openRotate();
          }}
        />
      )}
    </>
  );
}
