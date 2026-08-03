// Copyright (c) 2026 AI anime
import {
  useCallback,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import {
  projectImageGridToolbarActions,
  type GridActionKey,
  type GridActionRequest,
} from "@/modules/creative_canvas/public";
import { useHoverMenuController } from "@/features/canvas/hooks/useHoverMenuController";

export interface ImageGridToolbarControllerOptions {
  nodeId: string;
  onOpenGridAction: (request: GridActionRequest) => void;
}

export function useImageGridToolbarController({
  nodeId,
  onOpenGridAction,
}: ImageGridToolbarControllerOptions) {
  const { t, i18n } = useTranslation();
  const [activeActionKey, setActiveActionKey] =
    useState<GridActionKey | null>(null);
  const menu = useHoverMenuController();
  const actions = useMemo(
    () => projectImageGridToolbarActions(nodeId, (key) => t(key)),
    [i18n.language, nodeId, t],
  );

  const selectAction = useCallback(
    (request: GridActionRequest) => {
      setActiveActionKey(request.key);
      onOpenGridAction(request);
    },
    [onOpenGridAction],
  );

  return {
    t,
    actions,
    activeActionKey,
    menuRootProps: menu.rootProps,
    menuHoverProps: menu.hoverProps,
    selectAction,
  };
}

export type ImageGridToolbarController = ReturnType<
  typeof useImageGridToolbarController
>;
