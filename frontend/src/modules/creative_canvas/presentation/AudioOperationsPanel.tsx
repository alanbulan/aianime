// Copyright (c) 2026 AI anime
import { createElement } from 'react';

import { useAudioOperationsPanelController } from '../canvasComposition';
import type { AudioOperationsPanelControllerOptions } from './useAudioOperationsPanelController';

import { AudioOperationsPanelView } from './AudioOperationsPanelView';

type AudioOperationsPanelProps = AudioOperationsPanelControllerOptions;

export function AudioOperationsPanel(props: AudioOperationsPanelProps) {
  const controller = useAudioOperationsPanelController(props);
  return createElement(AudioOperationsPanelView, { controller });
}
