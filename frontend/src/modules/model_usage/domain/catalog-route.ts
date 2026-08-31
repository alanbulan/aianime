// Copyright (c) 2026 AI anime

export interface CatalogRouteItem {
  code: string;
  capabilities: Record<string, unknown>;
}

export function catalogRouteSelector(
  item: CatalogRouteItem,
): string | undefined {
  const value = item.capabilities.routeSelector;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export function catalogRouteValue(item: CatalogRouteItem): string {
  return catalogRouteSelector(item) ?? "";
}

export function resolveCatalogRouteSelection(
  items: readonly CatalogRouteItem[],
  persistedSelection: string | null | undefined,
): string {
  const persisted = String(persistedSelection ?? "").trim();
  const exact = items.find((item) => catalogRouteValue(item) === persisted);
  return exact ? catalogRouteValue(exact) : "";
}
