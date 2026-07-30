// Copyright (c) 2026 AI anime
import { createElement } from 'react';

import {
  useAssetLibraryModalController,
  type AssetLibraryModalControllerOptions,
} from '@/features/canvas/hooks/useAssetLibraryModalController';

import { AssetLibraryModalView } from './AssetLibraryModalView';

export type AssetLibraryModalProps = AssetLibraryModalControllerOptions;

export function AssetLibraryModal(props: AssetLibraryModalProps) {
  const controller = useAssetLibraryModalController(props);
  return createElement(AssetLibraryModalView, { controller });
}
