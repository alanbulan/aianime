// Copyright (c) 2026 AI anime
export function probeAudioDurationMs(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }

    const audio = document.createElement("audio");
    let settled = false;
    const finish = (durationMs: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      resolve(durationMs);
    };
    const timer = window.setTimeout(() => finish(null), 8000);

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const seconds = audio.duration;
      finish(
        Number.isFinite(seconds) && seconds > 0
          ? Math.round(seconds * 1000)
          : null,
      );
    };
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}
