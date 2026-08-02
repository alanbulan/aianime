// Copyright (c) 2026 AI anime
import { useMemo } from "react";

import type { CommercialModelCatalog } from "@/modules/model_usage/public";
import {
  imageModelOptionsFromCatalog,
  type ImageModelOption,
} from "@/modules/production/domain/image-model";

interface CommercialCatalogQuery {
  data?: CommercialModelCatalog;
  error: Error | null;
  isLoading: boolean;
}

export interface ImageModelsQuery {
  data: ImageModelOption[];
  error: Error | null;
  isLoading: boolean;
}

export function createUseImageModels(
  useCommercialModelCatalog: (
    operation?: string,
    enabled?: boolean,
  ) => CommercialCatalogQuery,
) {
  return function useImageModels(enabled = true): ImageModelsQuery {
    const query = useCommercialModelCatalog("IMAGE", enabled);
    const data = useMemo(
      () => imageModelOptionsFromCatalog(query.data?.items ?? []),
      [query.data?.items],
    );
    return {
      data,
      error: query.error,
      isLoading: query.isLoading,
    };
  };
}
