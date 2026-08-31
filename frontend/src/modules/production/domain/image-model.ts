// Copyright (c) 2026 AI anime
import {
  catalogRouteSelector,
  resolveCatalogRouteSelection,
} from "@/modules/model_usage/public";

export interface ImageCatalogItem {
  code: string;
  displayName: string;
  capabilities: Record<string, unknown>;
}

export interface ImageModelOption {
  value: string;
  apiModel?: string;
  routeSelector?: string;
  label: string;
}

export function imageModelOptionsFromCatalog(
  items: readonly ImageCatalogItem[],
): ImageModelOption[] {
  return items.flatMap((item) => {
    const routeSelector = catalogRouteSelector(item);
    if (!routeSelector) return [];
    return [
      {
        value: routeSelector,
        apiModel: item.code,
        routeSelector,
        label: item.displayName,
      },
    ];
  });
}

export function resolveAuthorizedImageModel(
  options: readonly Pick<ImageModelOption, "value" | "apiModel">[],
  persistedModel: string | null | undefined,
): string {
  return resolveCatalogRouteSelection(
    options.map((option) => ({
      code: option.apiModel ?? option.value,
      capabilities:
        option.value === (option.apiModel ?? option.value)
          ? {}
          : { routeSelector: option.value },
    })),
    persistedModel,
  );
}
