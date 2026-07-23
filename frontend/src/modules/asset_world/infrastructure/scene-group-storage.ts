// Copyright (c) 2026 AI anime
const SCENE_GROUP_SELECTION_STORAGE_KEY_PREFIX = "ai-anime-scene-group:";

function sceneGroupSelectionStorageKey(project: string): string {
  return `${SCENE_GROUP_SELECTION_STORAGE_KEY_PREFIX}${encodeURIComponent(project)}`;
}

export function readStoredSceneGroupSelection(project: string): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.localStorage.getItem(sceneGroupSelectionStorageKey(project))?.trim() ||
    null
  );
}

export function writeStoredSceneGroupSelection(
  project: string,
  baseName: string,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(sceneGroupSelectionStorageKey(project), baseName);
}
