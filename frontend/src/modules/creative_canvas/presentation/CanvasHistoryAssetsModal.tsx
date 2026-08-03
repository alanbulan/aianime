// Copyright (c) 2026 AI anime
import { createElement, type ComponentType } from 'react';

import {
  useCanvasHistoryAssetsModalController,
  type CanvasHistoryAssetsModalControllerOptions,
} from './useCanvasHistoryAssetsModalController';

import { CanvasHistoryAssetsModalView } from './CanvasHistoryAssetsModalView';

export interface CanvasHistoryAssetsModalProps
  extends CanvasHistoryAssetsModalControllerOptions {
  ViewerLayer: ComponentType<{
    controller: ReturnType<typeof useCanvasHistoryAssetsModalController>;
  }>;
}

export function CanvasHistoryAssetsModal(
  props: CanvasHistoryAssetsModalProps,
) {
  const { ViewerLayer, ...controllerOptions } = props;
  const controller = useCanvasHistoryAssetsModalController(controllerOptions);
  return createElement(CanvasHistoryAssetsModalView, {
    controller,
    ViewerLayer,
  });
}
