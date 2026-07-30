// Copyright (c) 2026 AI anime
import { createElement } from 'react';

import {
  useCanvasHistoryAssetsModalController,
  type CanvasHistoryAssetsModalControllerOptions,
} from '@/features/canvas/hooks/useCanvasHistoryAssetsModalController';

import { CanvasHistoryAssetsModalView } from './CanvasHistoryAssetsModalView';

export type CanvasHistoryAssetsModalProps =
  CanvasHistoryAssetsModalControllerOptions;

export function CanvasHistoryAssetsModal(
  props: CanvasHistoryAssetsModalProps,
) {
  const controller = useCanvasHistoryAssetsModalController(props);
  return createElement(CanvasHistoryAssetsModalView, { controller });
}
