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
import type { TFunction } from "i18next";
import type { ReactNode } from "react";

import { UiChipButton } from "@/components/ui";
import {
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
} from "./canvasNodeActionToolbarStyles";
import { NodeToolbarIconChip } from "./NodeToolbarIconChip";
import type { NodeToolType } from "../domain/canvasNodeTool";

export type ImageNodeToolbarToolIcon = "crop" | "annotate" | "split";

export interface ImageNodeToolbarToolAction {
  type: NodeToolType;
  icon: ImageNodeToolbarToolIcon;
  label: string;
  iconOnly: boolean;
}

export interface ImageNodeToolbarViewState {
  t: TFunction;
  visible: boolean;
  canRotate: boolean;
  toolActions: ReadonlyArray<ImageNodeToolbarToolAction>;
  openPanorama(): void;
  openMultiDimension(): void;
  openRelight(): void;
  openRotate(): void;
  openTool(toolType: NodeToolType): void;
}

const toolIconMap: Record<ImageNodeToolbarToolIcon, LucideIcon> = {
  crop: Crop,
  annotate: PenLine,
  split: Scissors,
};

export interface ImageNodeToolbarActionsViewProps {
  controller: ImageNodeToolbarViewState;
  editActions: ReactNode;
  gridActions: ReactNode;
}

export function ImageNodeToolbarActionsView({
  controller,
  editActions,
  gridActions,
}: ImageNodeToolbarActionsViewProps) {
  if (!controller.visible) return null;
  const {
    t,
    canRotate,
    toolActions,
    openPanorama,
    openMultiDimension,
    openRelight,
    openRotate,
    openTool,
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
      {editActions}
      {gridActions}
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
