// Copyright (c) 2026 AI anime
import type {
  VideoReferenceAudioDurationGateway,
  VideoReferenceDurationGateway,
  VideoReferenceMediaType,
} from "../application/validateVideoReferenceAudioDuration";

export function probeAudioDurationMs(url: string): Promise<number | null> {
  return probeMediaDurationMs(url, "audio");
}

export function probeVideoDurationMs(url: string): Promise<number | null> {
  return probeMediaDurationMs(url, "video");
}

function probeMediaDurationMs(
  url: string,
  media: VideoReferenceMediaType,
): Promise<number | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }

    const element = document.createElement(media);
    let settled = false;
    const finish = (durationMs: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute("src");
      element.load();
      resolve(durationMs);
    };
    const timer = window.setTimeout(() => finish(null), 8000);

    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const seconds = element.duration;
      finish(
        Number.isFinite(seconds) && seconds > 0
          ? Math.round(seconds * 1000)
          : null,
      );
    };
    element.onerror = () => finish(null);
    element.src = url;
  });
}

export const browserAudioMetadataGateway: VideoReferenceAudioDurationGateway = {
  probeDurationMs: probeAudioDurationMs,
};

export const browserReferenceDurationGateway: VideoReferenceDurationGateway = {
  probeDurationMs: (url, media) => probeMediaDurationMs(url, media),
};
