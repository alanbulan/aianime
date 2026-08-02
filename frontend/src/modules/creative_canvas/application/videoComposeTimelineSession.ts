// Copyright (c) 2026 AI anime
import {
  AUDIO_TRACK_ID,
  FALLBACK_CLIP_MS,
  VIDEO_TRACK_ID,
  clipLengthMs,
  compactVideoTracks,
  layoutTrack,
  type ComposeClip,
  type ComposeTimelineState,
  type ComposeTrack,
  type ComposeTrackKind,
} from '../domain/videoComposeTimeline';

export type VideoComposeClipIdFactory = () => string;

export interface VideoComposeSourceMedia {
  readonly nodeId: string;
  readonly kind: ComposeTrackKind;
  readonly sourceUrl: string;
  readonly displayName: string | null;
  readonly thumbUrl: string | null;
  readonly durationMs: number | null;
}

export function buildVideoComposeInitialTimeline(
  sources: readonly VideoComposeSourceMedia[],
  seedNodeIds: readonly string[],
  createClipId: VideoComposeClipIdFactory,
): ComposeTimelineState {
  const byId = new Map(
    sources.map((source) => [source.nodeId, source] as const),
  );
  const videoClips: ComposeClip[] = [];
  const audioClips: ComposeClip[] = [];
  let videoCursor = 0;
  let audioCursor = 0;

  for (const nodeId of seedNodeIds) {
    const source = byId.get(nodeId);
    if (!source) continue;
    if (source.kind === 'video') {
      const durationMs = source.durationMs;
      const length = durationMs ?? FALLBACK_CLIP_MS;
      videoClips.push({
        id: createClipId(),
        nodeId,
        kind: 'video',
        sourceUrl: source.sourceUrl,
        displayName: source.displayName,
        thumbUrl: source.thumbUrl,
        durationMs,
        timelineStartMs: videoCursor,
        trimStartMs: 0,
        trimEndMs: length,
        volume: 1,
        muted: false,
        speed: 1,
      });
      videoCursor += length;
      continue;
    }
    const durationMs = source.durationMs;
    const length = durationMs ?? FALLBACK_CLIP_MS;
    audioClips.push({
      id: createClipId(),
      nodeId,
      kind: 'audio',
      sourceUrl: source.sourceUrl,
      displayName: source.displayName,
      thumbUrl: null,
      durationMs,
      timelineStartMs: audioCursor,
      trimStartMs: 0,
      trimEndMs: length,
      volume: 1,
      muted: false,
      speed: 1,
    });
    audioCursor += length;
  }

  const tracks: ComposeTrack[] = [
    { id: VIDEO_TRACK_ID, kind: 'video', clips: videoClips },
  ];
  if (audioClips.length > 0) {
    tracks.push({ id: AUDIO_TRACK_ID, kind: 'audio', clips: audioClips });
  }
  return { tracks, resolution: '1080p' };
}

export function reconcileVideoComposeDraftWithSources(
  draft: ComposeTimelineState,
  sources: readonly VideoComposeSourceMedia[],
  seedNodeIds: readonly string[],
  createClipId: VideoComposeClipIdFactory,
): ComposeTimelineState {
  const connected = new Set(seedNodeIds);
  const tracks: ComposeTrack[] = draft.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter(
      (clip) => clip.nodeId === null || connected.has(clip.nodeId),
    ),
  }));
  const present = new Set(
    tracks
      .flatMap((track) => track.clips.map((clip) => clip.nodeId))
      .filter((nodeId): nodeId is string => Boolean(nodeId)),
  );
  const missingNodeIds = seedNodeIds.filter((nodeId) => !present.has(nodeId));

  if (missingNodeIds.length > 0) {
    const fresh = buildVideoComposeInitialTimeline(
      sources,
      missingNodeIds,
      createClipId,
    );
    for (const freshTrack of fresh.tracks) {
      if (freshTrack.clips.length === 0) continue;
      const target = tracks.find((track) => track.kind === freshTrack.kind);
      if (!target) {
        tracks.push(freshTrack);
        continue;
      }
      let cursor = layoutTrack(target).reduce(
        (maximum, laid) => Math.max(maximum, laid.timelineEndMs),
        0,
      );
      for (const clip of freshTrack.clips) {
        target.clips.push({ ...clip, timelineStartMs: Math.round(cursor) });
        cursor += clipLengthMs(clip);
      }
    }
  }

  return compactVideoTracks({ ...draft, tracks });
}

export interface ResolveVideoComposeInitialTimelineOptions {
  initialTimeline?: ComposeTimelineState | null;
  sources: readonly VideoComposeSourceMedia[];
  seedNodeIds: readonly string[];
  createClipId: VideoComposeClipIdFactory;
}

export function resolveVideoComposeInitialTimeline({
  initialTimeline,
  sources,
  seedNodeIds,
  createClipId,
}: ResolveVideoComposeInitialTimelineOptions): ComposeTimelineState {
  return initialTimeline && initialTimeline.tracks?.length > 0
    ? reconcileVideoComposeDraftWithSources(
        initialTimeline,
        sources,
        seedNodeIds,
        createClipId,
      )
    : buildVideoComposeInitialTimeline(sources, seedNodeIds, createClipId);
}
