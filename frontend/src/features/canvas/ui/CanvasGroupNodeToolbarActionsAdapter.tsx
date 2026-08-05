// Copyright (c) 2026 AI anime
import { memo } from "react";
import { useTranslation } from "react-i18next";


import {
  GroupNodeToolbarActionsView,
  NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS,
  NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS,
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
  useGroupNodeToolbarController,
} from "@/modules/creative_canvas/public";

import { useCanvasStore } from "@/modules/creative_canvas/public";
const toolbarStyles = {
  menuContent: NODE_ACTION_TOOLBAR_MENU_CONTENT_CLASS,
  menuItem: NODE_ACTION_TOOLBAR_MENU_ITEM_CLASS,
  textButton: NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
};

export interface CanvasGroupNodeToolbarActionsAdapterProps {
  nodeId: string;
  backgroundColor: string | null;
}

export const CanvasGroupNodeToolbarActionsAdapter = memo(
  ({ nodeId, backgroundColor }: CanvasGroupNodeToolbarActionsAdapterProps) => {
    const { t } = useTranslation();
    const arrangeGroupChildren = useCanvasStore(
      (state) => state.arrangeGroupChildren,
    );
    const ungroupNode = useCanvasStore((state) => state.ungroupNode);
    const updateNodeData = useCanvasStore((state) => state.updateNodeData);
    const controller = useGroupNodeToolbarController({
      nodeId,
      backgroundColor,
      translate: (key) => t(key),
      arrangeGroupChildren,
      ungroupNode,
      updateNodeBackgroundColor: (targetNodeId, color) => {
        updateNodeData(targetNodeId, { backgroundColor: color });
      },
    });
    return (
      <GroupNodeToolbarActionsView
        controller={controller}
        styles={toolbarStyles}
      />
    );
  },
);

CanvasGroupNodeToolbarActionsAdapter.displayName =
  "CanvasGroupNodeToolbarActionsAdapter";
