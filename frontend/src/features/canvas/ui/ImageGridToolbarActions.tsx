// Copyright (c) 2026 AI anime
import { memo } from "react";

import {
  ImageGridToolbarActionsView,
  NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS,
  NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS,
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
  useImageGridToolbarController,
  type GridActionRequest,
} from "@/modules/creative_canvas/public";

const toolbarStyles = {
  menuContent: NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS,
  menuItem: NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS,
  textButton: NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
};

export interface ImageGridToolbarActionsProps {
  nodeId: string;
  onOpenGridAction: (request: GridActionRequest) => void;
}

export const ImageGridToolbarActions = memo(
  ({ nodeId, onOpenGridAction }: ImageGridToolbarActionsProps) => {
    const controller = useImageGridToolbarController({
      nodeId,
      onOpenGridAction,
    });
    return (
      <ImageGridToolbarActionsView
        controller={controller}
        styles={toolbarStyles}
      />
    );
  },
);

ImageGridToolbarActions.displayName = "ImageGridToolbarActions";
