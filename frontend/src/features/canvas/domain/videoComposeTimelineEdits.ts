// Copyright (c) 2026 AI anime
import { VIDEO_CLIP_MIN_DURATION_MS } from "./videoClipRange";
import {
  AUDIO_TRACK_ID,
  compactVideoTracks,
  FALLBACK_CLIP_MS,
  layoutTrack,
  packTrackClips,
  VIDEO_TRACK_ID,
  type ComposeClip,
  type ComposeTimelineState,
  type ComposeTrack,
  type LaidClip,
} from "./videoComposeTimeline";

export const VIDEO_COMPOSE_MIN_SPEED = 0.25;
export const VIDEO_COMPOSE_MAX_SPEED = 4;

export interface VideoComposeClipReference {
  trackId: string;
  clipId: string;
}

export interface ResolvedVideoComposeClipSelection {
  track: ComposeTrack;
  clip: ComposeClip;
  laid: LaidClip;
  sourceMsAtPlayhead: number | null;
  canSplitAtPlayhead: boolean;
}

export type VideoComposeTimelineEdit =
  | {
      type: "updateClip";
      target: VideoComposeClipReference;
      patch: Partial<ComposeClip>;
    }
  | {
      type: "resolveClipDuration";
      target: VideoComposeClipReference;
      durationMs: number;
    }
  | {
      type: "moveClipToNewTrack";
      target: VideoComposeClipReference;
      newTrackId: string;
    }
  | { type: "removeClip"; target: VideoComposeClipReference }
  | {
      type: "splitClip";
      target: VideoComposeClipReference;
      sourceMs: number;
      leftClipId: string;
      rightClipId: string;
    }
  | {
      type: "trimClipToPlayhead";
      target: VideoComposeClipReference;
      playheadMs: number;
      side: "left" | "right";
    }
  | {
      type: "setClipSpeed";
      target: VideoComposeClipReference;
      speed: number;
    }
  | {
      type: "setClipVolume";
      target: VideoComposeClipReference;
      volume: number;
    }
  | { type: "toggleClipMute"; target: VideoComposeClipReference }
  | {
      type: "insertClipCopy";
      sourceClip: ComposeClip;
      targetTrackId: string;
      afterClipId: string | null;
      copyClipId: string;
    }
  | { type: "removeClips"; clipIds: ReadonlySet<string> }
  | { type: "compactMainVideoTrack" };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isPersistentTrack(track: ComposeTrack): boolean {
  return (
    track.clips.length > 0 ||
    track.id === VIDEO_TRACK_ID ||
    track.id === AUDIO_TRACK_ID
  );
}

function updateClip(
  state: ComposeTimelineState,
  target: VideoComposeClipReference,
  patch: Partial<ComposeClip>,
): ComposeTimelineState {
  return {
    ...state,
    tracks: state.tracks.map((track) =>
      track.id !== target.trackId
        ? track
        : {
            ...track,
            clips: track.clips.map((clip) =>
              clip.id === target.clipId ? { ...clip, ...patch } : clip,
            ),
          },
    ),
  };
}

function resolveClip(
  state: ComposeTimelineState,
  target: VideoComposeClipReference,
): { track: ComposeTrack; clip: ComposeClip } | null {
  const track = state.tracks.find((candidate) => candidate.id === target.trackId);
  const clip = track?.clips.find((candidate) => candidate.id === target.clipId);
  return track && clip ? { track, clip } : null;
}

function sourceMsAtPlayhead(
  clip: ComposeClip,
  laid: LaidClip,
  playheadMs: number,
): number | null {
  if (
    playheadMs <= laid.timelineStartMs ||
    playheadMs >= laid.timelineEndMs
  ) {
    return null;
  }
  const speed = clip.speed > 0 ? clip.speed : 1;
  return clip.trimStartMs + (playheadMs - laid.timelineStartMs) * speed;
}

function canSplitClipAtSource(clip: ComposeClip, sourceMs: number): boolean {
  return (
    sourceMs > clip.trimStartMs + VIDEO_CLIP_MIN_DURATION_MS &&
    sourceMs < clip.trimEndMs - VIDEO_CLIP_MIN_DURATION_MS
  );
}

export function resolveVideoComposeClipSelection(
  state: ComposeTimelineState,
  target: VideoComposeClipReference | null,
  playheadMs: number,
): ResolvedVideoComposeClipSelection | null {
  if (!target) return null;
  const resolved = resolveClip(state, target);
  if (!resolved) return null;
  const laid = layoutTrack(resolved.track).find(
    (entry) => entry.clip.id === resolved.clip.id,
  );
  if (!laid) return null;
  const sourceMs = sourceMsAtPlayhead(resolved.clip, laid, playheadMs);
  return {
    ...resolved,
    laid,
    sourceMsAtPlayhead: sourceMs,
    canSplitAtPlayhead:
      sourceMs != null && canSplitClipAtSource(resolved.clip, sourceMs),
  };
}

export function applyVideoComposeTimelineEdit(
  state: ComposeTimelineState,
  edit: VideoComposeTimelineEdit,
): ComposeTimelineState {
  switch (edit.type) {
    case "updateClip":
      return updateClip(state, edit.target, edit.patch);

    case "resolveClipDuration": {
      const resolved = resolveClip(state, edit.target);
      if (!resolved) return state;
      return updateClip(state, edit.target, {
        durationMs: edit.durationMs,
        trimEndMs:
          resolved.clip.trimEndMs === FALLBACK_CLIP_MS ||
          resolved.clip.trimEndMs > edit.durationMs
            ? edit.durationMs
            : resolved.clip.trimEndMs,
      });
    }

    case "moveClipToNewTrack": {
      const resolved = resolveClip(state, edit.target);
      if (!resolved) return state;
      const tracks = state.tracks.map((track) =>
        track.id === edit.target.trackId
          ? {
              ...track,
              clips: track.clips.filter(
                (clip) => clip.id !== edit.target.clipId,
              ),
            }
          : track,
      );
      const sourceIndex = tracks.findIndex(
        (track) => track.id === edit.target.trackId,
      );
      tracks.splice(sourceIndex + 1, 0, {
        id: edit.newTrackId,
        kind: resolved.track.kind,
        clips: [resolved.clip],
      });
      return { ...state, tracks: tracks.filter(isPersistentTrack) };
    }

    case "removeClip": {
      const tracks = state.tracks
        .map((track) =>
          track.id === edit.target.trackId
            ? {
                ...track,
                clips: track.clips.filter(
                  (clip) => clip.id !== edit.target.clipId,
                ),
              }
            : track,
        )
        .filter(isPersistentTrack);
      return compactVideoTracks({ ...state, tracks });
    }

    case "splitClip": {
      const resolved = resolveClip(state, edit.target);
      if (!resolved || !canSplitClipAtSource(resolved.clip, edit.sourceMs)) {
        return state;
      }
      const speed = resolved.clip.speed > 0 ? resolved.clip.speed : 1;
      const leftLengthMs =
        (edit.sourceMs - resolved.clip.trimStartMs) / speed;
      return {
        ...state,
        tracks: state.tracks.map((track) => {
          if (track.id !== edit.target.trackId) return track;
          const index = track.clips.findIndex(
            (clip) => clip.id === edit.target.clipId,
          );
          if (index < 0) return track;
          const clips = [...track.clips];
          clips.splice(
            index,
            1,
            {
              ...resolved.clip,
              id: edit.leftClipId,
              trimEndMs: edit.sourceMs,
            },
            {
              ...resolved.clip,
              id: edit.rightClipId,
              trimStartMs: edit.sourceMs,
              timelineStartMs:
                resolved.clip.timelineStartMs + leftLengthMs,
            },
          );
          return { ...track, clips };
        }),
      };
    }

    case "trimClipToPlayhead": {
      const selection = resolveVideoComposeClipSelection(
        state,
        edit.target,
        edit.playheadMs,
      );
      const sourceMs = selection?.sourceMsAtPlayhead;
      if (!selection?.canSplitAtPlayhead || sourceMs == null) return state;
      const trimmed = updateClip(
        state,
        edit.target,
        edit.side === "left"
          ? {
              trimStartMs: sourceMs,
              timelineStartMs: edit.playheadMs,
            }
          : { trimEndMs: sourceMs },
      );
      return compactVideoTracks(trimmed);
    }

    case "setClipSpeed":
      return compactVideoTracks(
        updateClip(state, edit.target, {
          speed: clamp(
            edit.speed,
            VIDEO_COMPOSE_MIN_SPEED,
            VIDEO_COMPOSE_MAX_SPEED,
          ),
        }),
      );

    case "setClipVolume": {
      const volume = clamp(edit.volume, 0, 1);
      return updateClip(state, edit.target, {
        volume,
        muted: volume <= 0,
      });
    }

    case "toggleClipMute": {
      const resolved = resolveClip(state, edit.target);
      return resolved
        ? updateClip(state, edit.target, { muted: !resolved.clip.muted })
        : state;
    }

    case "insertClipCopy":
      return {
        ...state,
        tracks: state.tracks.map((track) => {
          if (track.id !== edit.targetTrackId) return track;
          const copy: ComposeClip = {
            ...edit.sourceClip,
            id: edit.copyClipId,
          };
          if (track.kind === "video") {
            const ordered = [...track.clips].sort(
              (left, right) => left.timelineStartMs - right.timelineStartMs,
            );
            const index = edit.afterClipId
              ? ordered.findIndex((clip) => clip.id === edit.afterClipId)
              : ordered.length - 1;
            ordered.splice(index + 1, 0, copy);
            return { ...track, clips: packTrackClips(ordered) };
          }
          const endMs = layoutTrack(track).reduce(
            (maximum, laid) => Math.max(maximum, laid.timelineEndMs),
            0,
          );
          return {
            ...track,
            clips: [
              ...track.clips,
              { ...copy, timelineStartMs: Math.round(endMs) },
            ],
          };
        }),
      };

    case "removeClips": {
      const tracks = state.tracks
        .map((track) => ({
          ...track,
          clips: track.clips.filter((clip) => !edit.clipIds.has(clip.id)),
        }))
        .filter(isPersistentTrack);
      return compactVideoTracks({ ...state, tracks });
    }

    case "compactMainVideoTrack":
      return compactVideoTracks(state);
  }
}
