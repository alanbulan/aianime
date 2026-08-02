// Copyright (c) 2026 AI anime
import {
  activeClipAt,
  type ActiveClip,
  type ComposeTimelineState,
  type ComposeTrack,
  type ComposeTrackKind,
} from "../domain/videoComposeTimeline";

export interface VideoComposeActiveMediaClock {
  clipId: string;
  timelineStartMs: number;
  timelineEndMs: number;
  trimStartMs: number;
  speed: number;
}

export interface VideoComposeMediaClockSample {
  loadedClipId: string | null;
  currentTimeSeconds: number;
  paused: boolean;
  seeking: boolean;
  readyState: number;
}

export function resolveVideoComposePreviewTrack(
  state: ComposeTimelineState,
  kind: ComposeTrackKind,
  playheadMs: number,
): ComposeTrack | null {
  const tracks = state.tracks.filter((track) => track.kind === kind);
  for (let index = tracks.length - 1; index >= 0; index -= 1) {
    if (activeClipAt(tracks[index], playheadMs)) return tracks[index];
  }
  return tracks[0] ?? null;
}

export function projectVideoComposeActiveMediaClock(
  active: ActiveClip | null,
): VideoComposeActiveMediaClock | null {
  if (!active) return null;
  return {
    clipId: active.laid.clip.id,
    timelineStartMs: active.laid.timelineStartMs,
    timelineEndMs: active.laid.timelineEndMs,
    trimStartMs: active.laid.clip.trimStartMs,
    speed: active.laid.clip.speed > 0 ? active.laid.clip.speed : 1,
  };
}

export function resolveVideoComposeMediaClockMs(
  active: VideoComposeActiveMediaClock | null,
  sample: VideoComposeMediaClockSample,
): number | null {
  if (!active || sample.paused || sample.seeking || sample.readyState < 2) {
    return null;
  }
  if (sample.loadedClipId !== active.clipId) return null;
  const timelineMs =
    active.timelineStartMs +
    (sample.currentTimeSeconds * 1000 - active.trimStartMs) / active.speed;
  if (
    timelineMs < active.timelineStartMs - 60 ||
    timelineMs > active.timelineEndMs + 60
  ) {
    return null;
  }
  return timelineMs;
}
