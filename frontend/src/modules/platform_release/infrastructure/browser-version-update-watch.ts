import { deployedVersionDiffers } from "@/modules/platform_release/domain/runtime-update";

const POLL_INTERVAL_MS = 120_000;

async function fetchDeployedBuildId(): Promise<string | null> {
  try {
    const response = await fetch(`/version.json?_v=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const buildId = (data as { buildId?: unknown } | null)?.buildId;
    return typeof buildId === "string" && buildId.length > 0 ? buildId : null;
  } catch {
    return null;
  }
}

export function installBrowserVersionUpdateWatch(options: {
  runningBuildId: string;
  onUpdateAvailable: () => void;
}): () => void {
  if (typeof window === "undefined" || !import.meta.env.PROD) {
    return () => undefined;
  }

  let stopped = false;
  let inFlight = false;
  let intervalId = 0;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisible);
  };

  const check = async (): Promise<void> => {
    if (inFlight || stopped || document.visibilityState !== "visible") return;
    inFlight = true;
    const deployed = await fetchDeployedBuildId();
    inFlight = false;
    if (stopped) return;
    if (deployedVersionDiffers(deployed, options.runningBuildId)) {
      options.onUpdateAvailable();
      stop();
    }
  };

  const onVisible = (): void => {
    if (document.visibilityState === "visible") void check();
  };

  void check();
  intervalId = window.setInterval(() => void check(), POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisible);

  return stop;
}
