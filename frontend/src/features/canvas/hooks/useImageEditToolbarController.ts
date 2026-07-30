// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  projectImageEditToolbar,
  type ImageEditToolbarActionKey,
} from "@/features/canvas/application/imageEditToolbarModel";
import { canvasEventBus } from "@/features/canvas/application/canvasServices";
import { NODE_TOOL_TYPES } from "@/features/canvas/domain/canvasNodes";
import { useHoverMenuController } from "@/features/canvas/hooks/useHoverMenuController";

export interface ImageEditToolbarControllerOptions {
  nodeId: string;
  isPresetLocked: boolean;
  onOpenRedraw: (nodeId: string) => void;
  onOpenErase: (nodeId: string) => void;
  onMatteImage: () => void;
  onOpenUpscale: (nodeId: string) => void;
  onOpenOutpaint: (nodeId: string) => void;
}

export function useImageEditToolbarController({
  nodeId,
  isPresetLocked,
  onOpenRedraw,
  onOpenErase,
  onMatteImage,
  onOpenUpscale,
  onOpenOutpaint,
}: ImageEditToolbarControllerOptions) {
  const { t, i18n } = useTranslation();
  const [selectedActionKey, setSelectedActionKey] =
    useState<ImageEditToolbarActionKey>("matting");
  const menu = useHoverMenuController();
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
          onMatteImage();
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
      onMatteImage,
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
