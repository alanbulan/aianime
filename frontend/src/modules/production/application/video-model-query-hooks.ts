// Copyright (c) 2026 AI anime
import { useMemo } from "react";

import type { CommercialModelCatalog } from "@/modules/model_usage/public";
import {
  videoModelOptionsFromCatalog,
  type VideoModelOption,
} from "@/modules/production/domain/video-model";

interface CommercialCatalogQuery {
  data?: CommercialModelCatalog;
  error: Error | null;
  isLoading: boolean;
}

export interface VideoModelsQuery {
  data: VideoModelOption[];
  error: Error | null;
  isLoading: boolean;
}

export function createUseVideoModels(
  useCommercialModelCatalog: (
    operation?: string,
    enabled?: boolean,
  ) => CommercialCatalogQuery,
) {
  return function useVideoModels(enabled = true): VideoModelsQuery {
    const query = useCommercialModelCatalog("VIDEO", enabled);
    const data = useMemo(
      () => videoModelOptionsFromCatalog(query.data?.items ?? []),
      [query.data?.items],
    );
    return {
      data,
      error: query.error,
      isLoading: query.isLoading,
    };
  };
}
