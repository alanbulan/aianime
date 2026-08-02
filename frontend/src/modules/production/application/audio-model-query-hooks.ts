// Copyright (c) 2026 AI anime
import { useMemo } from 'react';

import {
  audioModelOptionsForMode,
  type AudioModelMode,
  type AudioModelOption,
  type CommercialModelCatalog,
} from '@/modules/model_usage/public';

interface CommercialCatalogQuery {
  data?: CommercialModelCatalog;
  error: Error | null;
  isLoading: boolean;
}

export interface AudioModelsQuery {
  data: AudioModelOption[];
  error: Error | null;
  isLoading: boolean;
}

export function createUseAudioModels(
  useCommercialModelCatalog: (
    operation?: string,
    enabled?: boolean,
  ) => CommercialCatalogQuery,
) {
  return function useAudioModels(
    mode: AudioModelMode,
    enabled = true,
  ): AudioModelsQuery {
    const query = useCommercialModelCatalog('AUDIO', enabled);
    const data = useMemo(
      () => audioModelOptionsForMode(query.data?.items ?? [], mode),
      [mode, query.data?.items],
    );
    return {
      data,
      error: query.error,
      isLoading: query.isLoading,
    };
  };
}
