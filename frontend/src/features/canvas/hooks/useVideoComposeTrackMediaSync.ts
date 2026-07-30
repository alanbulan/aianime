// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useRef, type RefObject } from 'react';

import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import {
  activeClipAt,
  type ComposeTrack,
} from '@/features/canvas/domain/videoComposeTimeline';

export function useVideoComposeTrackMediaSync<
  T extends HTMLMediaElement,
>(
  ref: RefObject<T | null>,
  track: ComposeTrack | null,
  playheadMs: number,
  isPlaying: boolean,
  forceMuted: boolean,
): void {
  const active = useMemo(
    () => (track ? activeClipAt(track, playheadMs) : null),
    [playheadMs, track],
  );
  const activeRef = useRef(active);
  activeRef.current = active;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const activeClipId = active?.laid.clip.id ?? null;
  const sourceUrl = active?.laid.clip.sourceUrl ?? null;
  const speed = active?.laid.clip.speed ?? 1;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!sourceUrl) {
      element.pause();
      element.removeAttribute('src');
      delete element.dataset.clipId;
      try {
        element.load();
      } catch {
        // Clearing a detached media element is best effort.
      }
      return;
    }
    element.dataset.clipId = activeClipId ?? '';
    element.src = resolveImageDisplayUrl(sourceUrl);
    try {
      element.load();
    } catch {
      // Metadata may still be supplied by the host media implementation.
    }
    const onReady = () => {
      const current = activeRef.current;
      try {
        element.currentTime = (current ? current.sourceMs : 0) / 1000;
      } catch {
        // Seeking unsupported media is non-fatal for the timeline.
      }
      if (isPlayingRef.current) {
        void element.play().catch(() => undefined);
      }
    };
    element.addEventListener('loadedmetadata', onReady, { once: true });
    return () => element.removeEventListener('loadedmetadata', onReady);
  }, [activeClipId, ref, sourceUrl]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const current = activeRef.current;
    element.volume = current ? current.laid.clip.volume : 1;
    element.muted = forceMuted || (current ? current.laid.clip.muted : false);
    element.playbackRate = speed > 0 ? speed : 1;
    if (isPlaying && activeClipId) {
      void element.play().catch(() => undefined);
    } else {
      element.pause();
    }
  }, [activeClipId, forceMuted, isPlaying, ref, speed]);

  const desiredSourceSecondsRef = useRef<number | null>(null);
  useEffect(() => {
    if (isPlaying) return;
    const element = ref.current;
    const current = activeRef.current;
    if (!element || !current) return;
    const target = current.sourceMs / 1000;
    desiredSourceSecondsRef.current = target;
    if (element.seeking || element.readyState < 1) return;
    try {
      element.currentTime = target;
    } catch {
      // The next metadata/seeked event will retry the latest target.
    }
  }, [active, isPlaying, playheadMs, ref]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onSeeked = () => {
      if (isPlayingRef.current) return;
      const target = desiredSourceSecondsRef.current;
      if (
        target !== null &&
        Math.abs(element.currentTime - target) > 0.05
      ) {
        try {
          element.currentTime = target;
        } catch {
          // A later seek event can retry without blocking playback.
        }
      }
    };
    element.addEventListener('seeked', onSeeked);
    return () => element.removeEventListener('seeked', onSeeked);
  }, [ref]);
}
