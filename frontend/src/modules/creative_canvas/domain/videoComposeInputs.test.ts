import { describe, expect, it } from 'vitest';

import {
  MIN_VIDEO_COMPOSE_VIDEOS,
  projectVideoComposeInputs,
  type VideoComposeInputMedia,
} from './videoComposeInputs';

function media({
  id,
  kind,
  y,
  url,
}: {
  id: string;
  kind: 'video' | 'audio';
  y: number;
  url?: string;
}): VideoComposeInputMedia {
  return {
    nodeId: id,
    kind,
    sourceUrl: url ?? '',
    displayName: `${kind}:${id}`,
    thumbUrl: kind === 'video' ? `/${id}.jpg` : null,
    durationMs: null,
    verticalPosition: y,
  };
}

describe('projectVideoComposeInputs', () => {
  it('orders playable media by vertical position and projects source DTOs', () => {
    const inputs = [
      media({ id: 'video-lower', kind: 'video', y: 80, url: '/b.mp4' }),
      media({ id: 'audio-top', kind: 'audio', y: 10, url: '/a.wav' }),
      media({ id: 'video-middle', kind: 'video', y: 40, url: '/a.mp4' }),
      media({ id: 'video-empty', kind: 'video', y: 0 }),
    ];

    expect(projectVideoComposeInputs(inputs)).toEqual({
      seedNodeIds: ['audio-top', 'video-middle', 'video-lower'],
      videoCount: 2,
      canOpen: true,
      sourceMedia: [
        expect.objectContaining({
          nodeId: 'audio-top',
          kind: 'audio',
          sourceUrl: '/a.wav',
        }),
        expect.objectContaining({
          nodeId: 'video-middle',
          kind: 'video',
          sourceUrl: '/a.mp4',
        }),
        expect.objectContaining({
          nodeId: 'video-lower',
          kind: 'video',
          sourceUrl: '/b.mp4',
        }),
      ],
    });
    expect(inputs.map((item) => item.nodeId)).toEqual([
      'video-lower',
      'audio-top',
      'video-middle',
      'video-empty',
    ]);
  });

  it('counts only playable videos toward the editor minimum', () => {
    const projection = projectVideoComposeInputs([
      media({ id: 'video-a', kind: 'video', y: 0, url: '/a.mp4' }),
      media({ id: 'audio-a', kind: 'audio', y: 10, url: '/a.wav' }),
      media({ id: 'audio-b', kind: 'audio', y: 20, url: '/b.wav' }),
    ]);

    expect(MIN_VIDEO_COMPOSE_VIDEOS).toBe(2);
    expect(projection.videoCount).toBe(1);
    expect(projection.canOpen).toBe(false);
  });

  it('returns an empty projection when no upstream media is playable', () => {
    expect(projectVideoComposeInputs([])).toEqual({
      seedNodeIds: [],
      videoCount: 0,
      canOpen: false,
      sourceMedia: [],
    });
  });
});
