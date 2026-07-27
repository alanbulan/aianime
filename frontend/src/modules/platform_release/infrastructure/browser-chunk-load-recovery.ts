import type { ChunkLoadRecoveryResult } from "@/modules/platform_release/domain/runtime-update";

let installed = false;

export function installBrowserChunkLoadRecovery(
  onError: (error: unknown) => ChunkLoadRecoveryResult,
): () => void {
  if (installed || typeof window === "undefined") return () => undefined;
  installed = true;

  const handlePreloadError = (event: Event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    if (onError(payload) === "ignored") return;
    event.preventDefault();
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (onError(event.reason) === "ignored") return;
    event.preventDefault();
  };

  window.addEventListener("vite:preloadError", handlePreloadError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    installed = false;
    window.removeEventListener("vite:preloadError", handlePreloadError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  };
}
