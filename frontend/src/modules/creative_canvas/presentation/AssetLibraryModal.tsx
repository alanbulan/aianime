// Copyright (c) 2026 AI anime
import { createElement } from 'react';

import {
  useAssetLibraryModalController,
  type AssetLibraryModalControllerOptions,
} from './useAssetLibraryModalController';

import { AssetLibraryModalView } from './AssetLibraryModalView';

export interface AssetLibraryModalProps
  extends AssetLibraryModalControllerOptions {
  resolveMediaUrl: (url: string) => string;
}

export function AssetLibraryModal(props: AssetLibraryModalProps) {
  const { resolveMediaUrl, ...controllerOptions } = props;
  const controller = useAssetLibraryModalController(controllerOptions);
  return createElement(AssetLibraryModalView, {
    controller,
    resolveMediaUrl,
  });
}
