// Copyright (c) 2026 AI anime
import type { AssetTab } from "@/modules/asset_world/domain/character";

const ASSET_TABS: readonly AssetTab[] = [
  "characters",
  "scenes",
  "props",
  "voices",
];
const ASSET_TAB_STORAGE_KEY_PREFIX = "ai-anime-asset-tab:";

function storageKey(project: string): string {
  return `${ASSET_TAB_STORAGE_KEY_PREFIX}${encodeURIComponent(project)}`;
}

export function readStoredAssetTab(project: string): AssetTab {
  if (typeof window === "undefined") return "characters";
  const stored = window.localStorage.getItem(storageKey(project));
  return ASSET_TABS.includes(stored as AssetTab)
    ? (stored as AssetTab)
    : "characters";
}

export function writeStoredAssetTab(project: string, tab: AssetTab): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(project), tab);
}
