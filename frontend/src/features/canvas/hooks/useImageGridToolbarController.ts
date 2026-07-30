// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { projectImageGridToolbarActions } from "@/features/canvas/application/imageGridToolbarModel";
import type {
  GridActionKey,
  GridActionRequest,
} from "@/features/canvas/domain/gridAction";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actions = useMemo(
    () => projectImageGridToolbarActions(nodeId, (key) => t(key)),
    [i18n.language, nodeId, t],
  );

  const cancelMenuClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    cancelMenuClose();
    setMenuOpen(true);
  }, [cancelMenuClose]);

  const scheduleMenuClose = useCallback(() => {
    cancelMenuClose();
    closeTimerRef.current = setTimeout(() => setMenuOpen(false), 160);
  }, [cancelMenuClose]);

  const setMenuOpenNow = useCallback(
    (open: boolean) => {
      cancelMenuClose();
      setMenuOpen(open);
    },
    [cancelMenuClose],
  );

  useEffect(() => cancelMenuClose, [cancelMenuClose]);

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
    menuRootProps: {
      open: menuOpen,
      onOpenChange: setMenuOpenNow,
      modal: false,
    } as const,
    menuHoverProps: {
      onMouseEnter: openMenu,
      onMouseLeave: scheduleMenuClose,
    },
    selectAction,
  };
}

export type ImageGridToolbarController = ReturnType<
  typeof useImageGridToolbarController
>;
