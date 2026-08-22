// Copyright (c) 2026 AI anime
import { useMemo } from 'react';

import {
  resolveCommercialModelRoleRoute,
  type AudioModelMode,
  type AudioModelOption,
  type CommercialModelAccessStatus,
} from '@/modules/model_usage/public';

interface CommercialModelAccessQuery {
  data?: CommercialModelAccessStatus;
  error: Error | null;
  isLoading: boolean;
}

export interface AudioModelsQuery {
  data: AudioModelOption[];
  error: Error | null;
  isLoading: boolean;
}

export function createUseAudioModels(
  useCommercialModelAccessStatus: (
    enabled?: boolean,
  ) => CommercialModelAccessQuery,
) {
  return function useAudioModels(
    mode: AudioModelMode,
    enabled = true,
  ): AudioModelsQuery {
    const query = useCommercialModelAccessStatus(enabled);
    const data = useMemo(
      () => {
        const role =
          mode === 'music'
            ? 'AUDIO_MUSIC'
            : mode === 'voiceClone'
              ? 'AUDIO_VOICE_CLONE'
              : 'AUDIO_SPEECH';
        const route = resolveCommercialModelRoleRoute(query.data, role);
        return route
          ? [{ value: route.modelId, label: route.modelId, supportedModes: [mode] }]
          : [];
      },
      [mode, query.data],
    );
    return {
      data,
      error: query.error,
      isLoading: query.isLoading,
    };
  };
}
