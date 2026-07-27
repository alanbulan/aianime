const VERSION_UPDATE_EVENT = "ai-anime:version-update-dialog";

export function openVersionUpdateDialog(): void {
  window.dispatchEvent(new Event(VERSION_UPDATE_EVENT));
}

export function subscribeOpenVersionUpdateDialog(
  listener: () => void,
): () => void {
  window.addEventListener(VERSION_UPDATE_EVENT, listener);
  return () => window.removeEventListener(VERSION_UPDATE_EVENT, listener);
}
