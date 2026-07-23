const HIDDEN_IMPORTED_PREVIEW_KEY_PREFIX =
  "ai-anime-ingest-hidden-imported-preview:";

function hiddenImportedPreviewKey(project: string): string {
  return `${HIDDEN_IMPORTED_PREVIEW_KEY_PREFIX}${encodeURIComponent(project)}`;
}

function readHiddenImportedPreview(project: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(hiddenImportedPreviewKey(project)) === "1";
}

function writeHiddenImportedPreview(
  project: string,
  hidden: boolean,
): void {
  if (typeof window === "undefined") return;
  const key = hiddenImportedPreviewKey(project);
  if (hidden) {
    window.localStorage.setItem(key, "1");
  } else {
    window.localStorage.removeItem(key);
  }
}

export const importPreviewPreference = {
  read: readHiddenImportedPreview,
  write: writeHiddenImportedPreview,
};
