// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  projectImageEditToolbar,
  type ImageEditToolbarActionKey,
} from '../domain/imageEditToolbarModel';
import type { ImageMatteControllerOptions } from './useImageMatteController';
import { useHoverMenuController } from './useHoverMenuController';

export interface ImageEditToolbarControllerOptions {
  projectId: string;
  nodeId: string;
  nodeData: object;
  imageSource: string | null;
  isPresetLocked: boolean;
  onOpenRedraw: (nodeId: string) => void;
  onOpenErase: (nodeId: string) => void;
  onOpenUpscale: (nodeId: string) => void;
  onOpenOutpaint: (nodeId: string) => void;
}

export interface ImageEditToolbarControllerDependencies {
  useImageMatteController: (
    options: ImageMatteControllerOptions,
  ) => { matte: () => void };
  openCropTool: (nodeId: string) => void;
}

export function createUseImageEditToolbarController(
  dependencies: ImageEditToolbarControllerDependencies,
) {
  const { useImageMatteController, openCropTool } = dependencies;

  return function useImageEditToolbarController({
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
      useState<ImageEditToolbarActionKey>('matting');
    const menu = useHoverMenuController();
    const { matte } = useImageMatteController({
      projectId,
      nodeId,
      nodeData,
      imageSource,
      displayName: t('nodeToolbar.matting'),
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
          case 'repaint':
            onOpenRedraw(nodeId);
            return;
          case 'erase':
            onOpenErase(nodeId);
            return;
          case 'matting':
            matte();
            return;
          case 'crop':
            openCropTool(nodeId);
            return;
          case 'hd':
            onOpenUpscale(nodeId);
            return;
          case 'outpaint':
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
  };
}

export type ImageEditToolbarController = ReturnType<
  ReturnType<typeof createUseImageEditToolbarController>
>;
