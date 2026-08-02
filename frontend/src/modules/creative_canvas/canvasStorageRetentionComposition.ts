// Copyright (c) 2026 AI anime
import {
  installBrowserCanvasStorageReclaimer,
  pruneFreezoneCanvasStorage,
} from "./infrastructure/browserCanvasStorageReclaimer";

let draftPruneScheduled = false;

export function scheduleCanvasDraftPruneOnce(): void {
  if (draftPruneScheduled) return;
  draftPruneScheduled = true;
  const run = () => {
    pruneFreezoneCanvasStorage();
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 2_000 });
    return;
  }
  window.setTimeout(run, 300);
}

export function installFreezoneCanvasStorageReclaimer(): () => void {
  return installBrowserCanvasStorageReclaimer();
}
