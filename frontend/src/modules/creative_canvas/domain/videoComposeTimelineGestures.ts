// Copyright (c) 2026 AI anime
import { VIDEO_CLIP_MIN_DURATION_MS } from "./videoClipRange";
import {
  FALLBACK_CLIP_MS,
  VIDEO_TRACK_ID,
  clipLengthMs,
  layoutTrack,
  packTrackClips,
  reorderIndexForDrag,
  type ComposeClip,
  type ComposeTimelineState,
  type ComposeTrackKind,
} from "./videoComposeTimeline";

const SNAP_GRID_MS = 500;
const SNAP_DISTANCE_PX = 8;

export interface VideoComposeClipDragSession {
  clipId: string;
  kind: ComposeTrackKind;
  originalTimelineStartMs: number;
  lengthMs: number;
}

export interface AppliedVideoComposeClipDragProjection {
  status: "applied";
  timeline: ComposeTimelineState;
  targetTrackId: string;
  autoCreatedTrackId: string | null;
  magnetic: boolean;
}

export interface BlockedVideoComposeClipDragProjection {
  status: "blocked";
  magnetic: false;
}

export type VideoComposeClipDragProjection =
  | AppliedVideoComposeClipDragProjection
  | BlockedVideoComposeClipDragProjection;

export interface VideoComposeTrimDragSession {
  target: { trackId: string; clipId: string };
  originalTrimStartMs: number;
  originalTrimEndMs: number;
  originalTimelineStartMs: number;
  speed: number;
  maxTrimEndMs: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function timelineBoundaries(
  state: ComposeTimelineState,
  excludedClipId?: string,
): number[] {
  const boundaries = [0];
  for (const track of state.tracks) {
    for (const laid of layoutTrack(track)) {
      if (laid.clip.id === excludedClipId) continue;
      boundaries.push(laid.timelineStartMs, laid.timelineEndMs);
    }
  }
  return boundaries;
}

function nextAutoCreatedTrackId(
  createdTrackId: string | null,
  previousTrackId: string | null,
  targetTrackId: string,
): string | null {
  if (createdTrackId) return createdTrackId;
  return targetTrackId === previousTrackId ? previousTrackId : null;
}

function removeClipFromTracks(
  state: ComposeTimelineState,
  clipId: string,
) {
  return state.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.id !== clipId),
  }));
}

function insertCreatedTrack(
  tracks: ComposeTimelineState["tracks"],
  sourceTrackId: string,
  createdTrackId: string | null,
  kind: ComposeTrackKind,
): void {
  if (!createdTrackId) return;
  const sourceIndex = tracks.findIndex((track) => track.id === sourceTrackId);
  tracks.splice(sourceIndex + 1, 0, {
    id: createdTrackId,
    kind,
    clips: [],
  });
}

function removeAbandonedAutoTrack(
  tracks: ComposeTimelineState["tracks"],
  previousTrackId: string | null,
  targetTrackId: string,
) {
  return previousTrackId && previousTrackId !== targetTrackId
    ? tracks.filter(
        (track) => track.id !== previousTrackId || track.clips.length > 0,
      )
    : tracks;
}

export function createVideoComposeClipDragSession(
  state: ComposeTimelineState,
  target: { trackId: string; clipId: string },
): VideoComposeClipDragSession | null {
  const track = state.tracks.find((candidate) => candidate.id === target.trackId);
  const clip = track?.clips.find((candidate) => candidate.id === target.clipId);
  return clip
    ? {
        clipId: clip.id,
        kind: clip.kind,
        originalTimelineStartMs: clip.timelineStartMs,
        lengthMs: clipLengthMs(clip),
      }
    : null;
}

export function snapVideoComposeClipStart(input: {
  state: ComposeTimelineState;
  clipId: string;
  startMs: number;
  lengthMs: number;
  pxPerMs: number;
  enabled: boolean;
}): number {
  if (!input.enabled) return Math.max(0, input.startMs);
  let best = input.startMs;
  let bestDistancePx = SNAP_DISTANCE_PX;
  for (const boundary of timelineBoundaries(input.state, input.clipId)) {
    const startDistancePx =
      Math.abs(boundary - input.startMs) * input.pxPerMs;
    if (startDistancePx < bestDistancePx) {
      bestDistancePx = startDistancePx;
      best = boundary;
    }
    const endDistancePx =
      Math.abs(boundary - (input.startMs + input.lengthMs)) * input.pxPerMs;
    if (endDistancePx < bestDistancePx) {
      bestDistancePx = endDistancePx;
      best = boundary - input.lengthMs;
    }
  }
  return Math.max(0, best);
}

export function snapVideoComposePlayhead(input: {
  state: ComposeTimelineState;
  playheadMs: number;
  pxPerMs: number;
  enabled: boolean;
}): number {
  if (!input.enabled) return input.playheadMs;
  let best: number | null = null;
  let bestDistancePx = SNAP_DISTANCE_PX;
  for (const boundary of timelineBoundaries(input.state)) {
    const distancePx = Math.abs(boundary - input.playheadMs) * input.pxPerMs;
    if (distancePx < bestDistancePx) {
      bestDistancePx = distancePx;
      best = boundary;
    }
  }
  return best ?? input.playheadMs;
}

export function projectVideoComposeClipDrag(input: {
  state: ComposeTimelineState;
  session: VideoComposeClipDragSession;
  destinationTrackId: string;
  createdTrackId: string | null;
  previousAutoCreatedTrackId: string | null;
  deltaMs: number;
  pxPerMs: number;
  snapEnabled: boolean;
}): VideoComposeClipDragProjection | null {
  const sourceTrack = input.state.tracks.find((track) =>
    track.clips.some((clip) => clip.id === input.session.clipId),
  );
  const movingClip = sourceTrack?.clips.find(
    (clip) => clip.id === input.session.clipId,
  );
  if (!sourceTrack || !movingClip) return null;
  if (
    !input.createdTrackId &&
    !input.state.tracks.some((track) => track.id === input.destinationTrackId)
  ) {
    return null;
  }

  if (
    input.session.kind === "video" &&
    input.destinationTrackId === VIDEO_TRACK_ID
  ) {
    let tracks = removeClipFromTracks(input.state, input.session.clipId);
    insertCreatedTrack(
      tracks,
      sourceTrack.id,
      input.createdTrackId,
      input.session.kind,
    );
    const destination = tracks.find(
      (track) => track.id === input.destinationTrackId,
    );
    if (!destination) return null;
    const siblings = [...destination.clips].sort(
      (left, right) => left.timelineStartMs - right.timelineStartMs,
    );
    const index = reorderIndexForDrag(
      siblings,
      input.session.originalTimelineStartMs + input.deltaMs,
      input.session.lengthMs,
    );
    siblings.splice(index, 0, movingClip);
    const packed = packTrackClips(siblings);
    tracks = tracks.map((track) =>
      track.id === input.destinationTrackId
        ? { ...track, clips: packed }
        : track,
    );
    tracks = removeAbandonedAutoTrack(
      tracks,
      input.previousAutoCreatedTrackId,
      input.destinationTrackId,
    );
    return {
      status: "applied",
      timeline: { ...input.state, tracks },
      targetTrackId: input.destinationTrackId,
      autoCreatedTrackId: nextAutoCreatedTrackId(
        input.createdTrackId,
        input.previousAutoCreatedTrackId,
        input.destinationTrackId,
      ),
      magnetic: true,
    };
  }

  const blockingClips = input.state.tracks
    .filter((track) => track.id === input.destinationTrackId)
    .flatMap((track) => layoutTrack(track))
    .filter((laid) => laid.clip.id !== input.session.clipId);
  let nextStartMs = snapVideoComposeClipStart({
    state: input.state,
    clipId: input.session.clipId,
    startMs: input.session.originalTimelineStartMs + input.deltaMs,
    lengthMs: input.session.lengthMs,
    pxPerMs: input.pxPerMs,
    enabled: input.snapEnabled,
  });
  let minimumStartMs = 0;
  let maximumStartMs = Number.POSITIVE_INFINITY;
  for (const laid of blockingClips) {
    if (laid.timelineStartMs <= nextStartMs) {
      minimumStartMs = Math.max(minimumStartMs, laid.timelineEndMs);
    } else {
      maximumStartMs = Math.min(
        maximumStartMs,
        laid.timelineStartMs - input.session.lengthMs,
      );
    }
  }
  if (maximumStartMs < minimumStartMs) {
    return { status: "blocked", magnetic: false };
  }
  nextStartMs = Math.max(
    0,
    clamp(nextStartMs, minimumStartMs, maximumStartMs),
  );

  const placedClip: ComposeClip = {
    ...movingClip,
    timelineStartMs: Math.round(nextStartMs),
  };
  let tracks = removeClipFromTracks(input.state, input.session.clipId);
  insertCreatedTrack(
    tracks,
    sourceTrack.id,
    input.createdTrackId,
    input.session.kind,
  );
  tracks = tracks.map((track) =>
    track.id === input.destinationTrackId
      ? { ...track, clips: [...track.clips, placedClip] }
      : track,
  );
  tracks = removeAbandonedAutoTrack(
    tracks,
    input.previousAutoCreatedTrackId,
    input.destinationTrackId,
  );
  return {
    status: "applied",
    timeline: { ...input.state, tracks },
    targetTrackId: input.destinationTrackId,
    autoCreatedTrackId: nextAutoCreatedTrackId(
      input.createdTrackId,
      input.previousAutoCreatedTrackId,
      input.destinationTrackId,
    ),
    magnetic: false,
  };
}

export function createVideoComposeTrimDragSession(
  state: ComposeTimelineState,
  target: { trackId: string; clipId: string },
): VideoComposeTrimDragSession | null {
  const track = state.tracks.find((candidate) => candidate.id === target.trackId);
  const clip = track?.clips.find((candidate) => candidate.id === target.clipId);
  if (!track || !clip) return null;
  const speed = clip.speed > 0 ? clip.speed : 1;
  const sourceMaxEndMs =
    clip.durationMs ?? Math.max(clip.trimEndMs, FALLBACK_CLIP_MS);
  const blockingClips = (
    clip.kind === "video"
      ? state.tracks.filter((candidate) => candidate.kind === "video")
      : state.tracks.filter((candidate) => candidate.id === track.id)
  )
    .flatMap((candidate) => layoutTrack(candidate))
    .filter(
      (laid) =>
        laid.clip.id !== clip.id &&
        laid.timelineStartMs >= clip.timelineStartMs,
    );
  const nextNeighborStartMs = blockingClips.reduce(
    (minimum, laid) => Math.min(minimum, laid.timelineStartMs),
    Number.POSITIVE_INFINITY,
  );
  const maxTrimEndMs = Number.isFinite(nextNeighborStartMs)
    ? Math.min(
        sourceMaxEndMs,
        clip.trimStartMs +
          (nextNeighborStartMs - clip.timelineStartMs) * speed,
      )
    : sourceMaxEndMs;
  return {
    target,
    originalTrimStartMs: clip.trimStartMs,
    originalTrimEndMs: clip.trimEndMs,
    originalTimelineStartMs: clip.timelineStartMs,
    speed,
    maxTrimEndMs,
  };
}

export function projectVideoComposeTrimDrag(
  session: VideoComposeTrimDragSession,
  input: {
    edge: "start" | "end";
    deltaTimelineMs: number;
    snapEnabled: boolean;
  },
): Partial<ComposeClip> {
  const deltaSourceMs = input.deltaTimelineMs * session.speed;
  const snapSource = (sourceMs: number) =>
    input.snapEnabled
      ? Math.round(sourceMs / SNAP_GRID_MS) * SNAP_GRID_MS
      : sourceMs;
  if (input.edge === "start") {
    const trimStartMs = clamp(
      snapSource(session.originalTrimStartMs + deltaSourceMs),
      0,
      session.originalTrimEndMs - VIDEO_CLIP_MIN_DURATION_MS,
    );
    return {
      trimStartMs: Math.round(trimStartMs),
      timelineStartMs: Math.max(
        0,
        Math.round(
          session.originalTimelineStartMs +
            (trimStartMs - session.originalTrimStartMs) / session.speed,
        ),
      ),
    };
  }
  const trimEndMs = clamp(
    snapSource(session.originalTrimEndMs + deltaSourceMs),
    session.originalTrimStartMs + VIDEO_CLIP_MIN_DURATION_MS,
    session.maxTrimEndMs,
  );
  return { trimEndMs: Math.round(trimEndMs) };
}
