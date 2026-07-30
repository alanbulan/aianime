// Copyright (c) 2026 AI anime
import { createElement } from 'react';

import {
  useAudioOperationsPanelController,
  type AudioOperationsPanelControllerOptions,
} from '@/features/canvas/hooks/useAudioOperationsPanelController';

import { AudioOperationsPanelView } from './AudioOperationsPanelView';

type AudioOperationsPanelProps = AudioOperationsPanelControllerOptions;

export function AudioOperationsPanel(props: AudioOperationsPanelProps) {
  const controller = useAudioOperationsPanelController(props);
  return createElement(AudioOperationsPanelView, { controller });
}
