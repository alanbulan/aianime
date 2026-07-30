// Copyright (c) 2026 AI anime
import type { ComposeTrackKind } from '@/features/canvas/domain/videoComposeTimeline';

export type VideoComposeMediaUrlResolver = (url: string) => string;

export function probeVideoComposeMediaDuration(
  url: string,
  kind: ComposeTrackKind,
  resolveUrl: VideoComposeMediaUrlResolver,
): Promise<number | null> {
  return new Promise((resolve) => {
    const element = document.createElement(
      kind === 'audio' ? 'audio' : 'video',
    );
    element.preload = 'metadata';
    element.muted = true;
    const finish = (value: number | null) => {
      element.removeAttribute('src');
      try {
        element.load();
      } catch {
        // The result is already settled; cleanup is best effort.
      }
      resolve(value);
    };
    element.addEventListener(
      'loadedmetadata',
      () => {
        const duration = element.duration;
        finish(
          Number.isFinite(duration) && duration > 0
            ? Math.round(duration * 1000)
            : null,
        );
      },
      { once: true },
    );
    element.addEventListener('error', () => finish(null), { once: true });
    element.src = resolveUrl(url);
    try {
      element.load();
    } catch {
      finish(null);
    }
  });
}
