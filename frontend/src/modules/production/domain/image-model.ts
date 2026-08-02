// Copyright (c) 2026 AI anime

export interface ImageCatalogItem {
  code: string;
  displayName: string;
}

export interface ImageModelOption {
  value: string;
  label: string;
}

export function imageModelOptionsFromCatalog(
  items: readonly ImageCatalogItem[],
): ImageModelOption[] {
  return items.map((item) => ({
    value: item.code,
    label: item.displayName,
  }));
}
