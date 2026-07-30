// Copyright (c) 2026 AI anime
import {
  isAudioNode,
  isVideoNode,
  type CanvasNode,
} from '@/features/canvas/domain/canvasNodes';
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
} from '@/features/canvas/domain/videoComposeTimeline';

export type VideoComposeClipIdFactory = () => string;

export function buildVideoComposeInitialTimeline(
  nodes: CanvasNode[],
  seedNodeIds: string[],
  createClipId: VideoComposeClipIdFactory,
): ComposeTimelineState {
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const videoClips: ComposeClip[] = [];
  const audioClips: ComposeClip[] = [];
  let videoCursor = 0;
  let audioCursor = 0;

  for (const nodeId of seedNodeIds) {
    const node = byId.get(nodeId);
    if (!node) continue;
    if (isVideoNode(node) && node.data.videoUrl) {
      const durationMs =
        typeof node.data.durationMs === 'number' ? node.data.durationMs : null;
      const length = durationMs ?? FALLBACK_CLIP_MS;
      videoClips.push({
        id: createClipId(),
        nodeId,
        kind: 'video',
        sourceUrl: node.data.videoUrl,
        displayName: node.data.displayName ?? null,
        thumbUrl: node.data.previewImageUrl ?? null,
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
    if (isAudioNode(node) && node.data.audioUrl) {
      const durationMs =
        typeof node.data.durationMs === 'number' ? node.data.durationMs : null;
      const length = durationMs ?? FALLBACK_CLIP_MS;
      audioClips.push({
        id: createClipId(),
        nodeId,
        kind: 'audio',
        sourceUrl: node.data.audioUrl,
        displayName: node.data.displayName ?? null,
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
  nodes: CanvasNode[],
  seedNodeIds: string[],
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
      nodes,
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
  nodes: CanvasNode[];
  seedNodeIds: string[];
  createClipId: VideoComposeClipIdFactory;
}

export function resolveVideoComposeInitialTimeline({
  initialTimeline,
  nodes,
  seedNodeIds,
  createClipId,
}: ResolveVideoComposeInitialTimelineOptions): ComposeTimelineState {
  return initialTimeline && initialTimeline.tracks?.length > 0
    ? reconcileVideoComposeDraftWithSources(
        initialTimeline,
        nodes,
        seedNodeIds,
        createClipId,
      )
    : buildVideoComposeInitialTimeline(nodes, seedNodeIds, createClipId);
}
