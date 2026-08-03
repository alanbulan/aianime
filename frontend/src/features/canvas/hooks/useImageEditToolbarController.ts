// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type CanvasNodeData,
} from "@/features/canvas/domain/canvasNodes";
import { useHoverMenuController } from "@/features/canvas/hooks/useHoverMenuController";
import { useImageMatteController } from "@/features/canvas/hooks/useImageMatteController";
import {
  canvasEventBus,
  NODE_TOOL_TYPES,
  projectImageEditToolbar,
  type ImageEditToolbarActionKey,
} from "@/modules/creative_canvas/public";

export interface ImageEditToolbarControllerOptions {
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

export function useImageEditToolbarController({
  projectId,
  nodeId,
  nodeData,
  imageSource,
  isPresetLocked,
  onOpenRedraw,
  onOpenErase,
  onOpenUpscale,
  onOpenOutpaint,
}: ImageEditToolbarControllerOptions) {
  const { t, i18n } = useTranslation();
  const [selectedActionKey, setSelectedActionKey] =
    useState<ImageEditToolbarActionKey>("matting");
  const menu = useHoverMenuController();
  const { matte } = useImageMatteController({
    projectId,
    nodeId,
    nodeData,
    imageSource,
    displayName: t("nodeToolbar.matting"),
  });
  const projection = useMemo(
    () => projectImageEditToolbar(isPresetLocked, selectedActionKey),
    [isPresetLocked, selectedActionKey],
  );
  const actions = useMemo(
    () =>
      projection.actions.map((action) => ({
        key: action.key,
        label: t(action.labelKey),
      })),
    [i18n.language, projection.actions, t],
  );
  const activeAction = actions[projection.activeActionIndex];

  const selectAction = useCallback(
    (key: ImageEditToolbarActionKey) => {
      setSelectedActionKey(key);
      switch (key) {
        case "repaint":
          onOpenRedraw(nodeId);
          return;
        case "erase":
          onOpenErase(nodeId);
          return;
        case "matting":
          matte();
          return;
        case "crop":
          canvasEventBus.publish("tool-dialog/open", {
            nodeId,
            toolType: NODE_TOOL_TYPES.crop,
          });
          return;
        case "hd":
          onOpenUpscale(nodeId);
          return;
        case "outpaint":
          onOpenOutpaint(nodeId);
      }
    },
    [
      nodeId,
      matte,
      onOpenErase,
      onOpenOutpaint,
      onOpenRedraw,
      onOpenUpscale,
    ],
  );

  return {
    actions,
    activeAction,
    menuRootProps: menu.rootProps,
    menuHoverProps: menu.hoverProps,
    selectAction,
  };
}

export type ImageEditToolbarController = ReturnType<
  typeof useImageEditToolbarController
>;
