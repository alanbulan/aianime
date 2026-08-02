// Copyright (c) 2026 AI anime
import { createElement } from 'react';

import type { VoicePickResult } from '@/modules/creative_canvas/public';
import {
  useVoiceSelectionModalController,
  type VoiceSelectionModalControllerOptions,
} from '@/features/canvas/hooks/useVoiceSelectionModalController';

import { VoiceSelectionModalView } from './VoiceSelectionModalView';

export type { VoicePickResult };

type VoiceSelectionModalProps = VoiceSelectionModalControllerOptions;

export function VoiceSelectionModal(props: VoiceSelectionModalProps) {
  const controller = useVoiceSelectionModalController(props);
  return createElement(VoiceSelectionModalView, { controller });
}
