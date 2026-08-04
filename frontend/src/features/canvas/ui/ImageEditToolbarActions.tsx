// Copyright (c) 2026 AI anime
import { memo } from "react";

import type { CanvasNodeData } from "@/features/canvas/domain/canvasNodes";
import { useImageEditToolbarController } from "@/features/canvas/composition";
import {
  ImageEditToolbarActionsView,
  NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS,
  NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS,
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
} from "@/modules/creative_canvas/public";

const toolbarStyles = {
  menuContent: NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS,
  menuItem: NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS,
  textButton: NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
};

export interface ImageEditToolbarActionsProps {
  projectId: string;
  nodeId: string;
  nodeData: CanvasNodeData;
  imageSource: string | null;
  isPresetLocked: boolean;
  onOpenRedraw: (nodeId: string) => void;
  onOpenErase: (nodeId: string) => void;
  onOpenUpscale: (nodeId: string) => void;
  onOpenOutpaint: (nodeId: string) => void;
}

export const ImageEditToolbarActions = memo(
  ({
    projectId,
    nodeId,
    nodeData,
    imageSource,
    isPresetLocked,
    onOpenRedraw,
    onOpenErase,
    onOpenUpscale,
    onOpenOutpaint,
  }: ImageEditToolbarActionsProps) => {
    const controller = useImageEditToolbarController({
      projectId,
      nodeId,
      nodeData,
      imageSource,
      isPresetLocked,
      onOpenRedraw,
      onOpenErase,
      onOpenUpscale,
      onOpenOutpaint,
    });
    return (
      <ImageEditToolbarActionsView
        controller={controller}
        styles={toolbarStyles}
      />
    );
  },
);

ImageEditToolbarActions.displayName = "ImageEditToolbarActions";
