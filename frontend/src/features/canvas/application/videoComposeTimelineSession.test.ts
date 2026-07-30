// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '@/features/canvas/domain/canvasNodes';
import type {
  ComposeClip,
  ComposeTimelineState,
} from '@/features/canvas/domain/videoComposeTimeline';

import {
  buildVideoComposeInitialTimeline,
  reconcileVideoComposeDraftWithSources,
  resolveVideoComposeInitialTimeline,
} from './videoComposeTimelineSession';

function videoNode(
  id: string,
  url: string,
  durationMs?: number,
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.video,
    position: { x: 0, y: 0 },
    data: {
      videoUrl: url,
      durationMs,
      displayName: `video-${id}`,
      previewImageUrl: `/covers/${id}.jpg`,
    },
  } as CanvasNode;
}

function audioNode(
  id: string,
  url: string,
  durationMs?: number,
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.audio,
    position: { x: 0, y: 0 },
    data: {
      audioUrl: url,
      durationMs,
      displayName: `audio-${id}`,
    },
  } as CanvasNode;
}

function clip(
  id: string,
  nodeId: string | null,
  patch: Partial<ComposeClip> = {},
): ComposeClip {
  return {
    id,
    nodeId,
    kind: 'video',
    sourceUrl: `/${id}.mp4`,
    displayName: id,
    thumbUrl: null,
    durationMs: 4_000,
    timelineStartMs: 0,
    trimStartMs: 0,
    trimEndMs: 4_000,
    volume: 1,
    muted: false,
    speed: 1,
    ...patch,
  };
}

function idFactory(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

describe('videoComposeTimelineSession', () => {
  it('builds separate sequential video and audio tracks in seed order', () => {
    const nodes = [
      videoNode('video-a', '/a.mp4', 3_000),
      videoNode('video-b', '/b.mp4'),
      audioNode('audio-a', '/a.wav', 2_000),
    ];

    const timeline = buildVideoComposeInitialTimeline(
      nodes,
      ['audio-a', 'missing', 'video-a', 'video-b'],
      idFactory('clip-audio', 'clip-video-a', 'clip-video-b'),
    );

    expect(timeline.resolution).toBe('1080p');
    expect(timeline.tracks.map((track) => track.id)).toEqual([
      'track_video',
      'track_audio',
    ]);
    expect(
      timeline.tracks[0].clips.map((entry) => ({
        id: entry.id,
        nodeId: entry.nodeId,
        start: entry.timelineStartMs,
        end: entry.trimEndMs,
      })),
    ).toEqual([
      { id: 'clip-video-a', nodeId: 'video-a', start: 0, end: 3_000 },
      {
        id: 'clip-video-b',
        nodeId: 'video-b',
        start: 3_000,
        end: 5_000,
      },
    ]);
    expect(timeline.tracks[1].clips[0]).toMatchObject({
      id: 'clip-audio',
      nodeId: 'audio-a',
      timelineStartMs: 0,
      trimEndMs: 2_000,
      volume: 1,
      muted: false,
      speed: 1,
    });
  });

  it('omits the audio track when no playable audio source exists', () => {
    const timeline = buildVideoComposeInitialTimeline(
      [videoNode('video-a', '/a.mp4')],
      ['video-a'],
      idFactory('clip-video'),
    );

    expect(timeline.tracks).toHaveLength(1);
    expect(timeline.tracks[0]).toMatchObject({
      id: 'track_video',
      kind: 'video',
    });
  });

  it('drops disconnected clips, keeps external clips, and appends missing sources', () => {
    const connected = clip('connected', 'video-a', {
      timelineStartMs: 1_000,
      trimStartMs: 500,
      trimEndMs: 2_500,
      volume: 0.4,
    });
    const external = clip('external', null, {
      timelineStartMs: 5_000,
      trimEndMs: 1_000,
    });
    const disconnected = clip('disconnected', 'video-old', {
      timelineStartMs: 8_000,
    });
    const draft: ComposeTimelineState = {
      resolution: '720p',
      cover: { source: 'upload', frameMs: null, url: '/cover.jpg' },
      tracks: [
        {
          id: 'track_video',
          kind: 'video',
          clips: [connected, external, disconnected],
        },
      ],
    };

    const reconciled = reconcileVideoComposeDraftWithSources(
      draft,
      [videoNode('video-a', '/a.mp4'), videoNode('video-b', '/b.mp4', 2_000)],
      ['video-a', 'video-b'],
      idFactory('new-video'),
    );

    expect(reconciled.resolution).toBe('720p');
    expect(reconciled.cover).toEqual(draft.cover);
    expect(reconciled.tracks[0].clips.map((entry) => entry.id)).toEqual([
      'connected',
      'external',
      'new-video',
    ]);
    expect(reconciled.tracks[0].clips.map((entry) => entry.timelineStartMs)).toEqual([
      0,
      2_000,
      3_000,
    ]);
    expect(reconciled.tracks[0].clips[0]).toMatchObject({
      trimStartMs: 500,
      trimEndMs: 2_500,
      volume: 0.4,
    });
    expect(draft.tracks[0].clips).toEqual([
      connected,
      external,
      disconnected,
    ]);
  });

  it('creates a missing media-kind track while preserving the draft resolution', () => {
    const draft: ComposeTimelineState = {
      resolution: '720p',
      tracks: [{ id: 'track_video', kind: 'video', clips: [] }],
    };

    const reconciled = reconcileVideoComposeDraftWithSources(
      draft,
      [audioNode('audio-a', '/a.wav', 1_500)],
      ['audio-a'],
      idFactory('new-audio'),
    );

    expect(reconciled.resolution).toBe('720p');
    expect(reconciled.tracks[1]).toMatchObject({
      id: 'track_audio',
      kind: 'audio',
      clips: [
        expect.objectContaining({
          id: 'new-audio',
          nodeId: 'audio-a',
          trimEndMs: 1_500,
        }),
      ],
    });
  });

  it('uses only non-empty drafts and rebuilds an empty draft from sources', () => {
    const node = videoNode('video-a', '/a.mp4', 1_000);
    const rebuilt = resolveVideoComposeInitialTimeline({
      initialTimeline: { tracks: [], resolution: '720p' },
      nodes: [node],
      seedNodeIds: ['video-a'],
      createClipId: idFactory('rebuilt'),
    });
    expect(rebuilt).toMatchObject({
      resolution: '1080p',
      tracks: [
        {
          clips: [expect.objectContaining({ id: 'rebuilt' })],
        },
      ],
    });

    const existing: ComposeTimelineState = {
      resolution: '720p',
      tracks: [
        {
          id: 'track_video',
          kind: 'video',
          clips: [clip('existing', 'video-a')],
        },
      ],
    };
    const restored = resolveVideoComposeInitialTimeline({
      initialTimeline: existing,
      nodes: [node],
      seedNodeIds: ['video-a'],
      createClipId: idFactory('unused'),
    });
    expect(restored.resolution).toBe('720p');
    expect(restored.tracks[0].clips[0].id).toBe('existing');
  });
});
