import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from './canvasNodes';
import {
  MIN_VIDEO_COMPOSE_VIDEOS,
  projectVideoComposeInputs,
} from './videoComposeInputs';

function node({
  id,
  type,
  y,
  url,
}: {
  id: string;
  type: typeof CANVAS_NODE_TYPES.video | typeof CANVAS_NODE_TYPES.audio;
  y: number;
  url?: string | null;
}): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y },
    data: type === CANVAS_NODE_TYPES.video
      ? { videoUrl: url ?? null }
      : { audioUrl: url ?? null },
  } as CanvasNode;
}

describe('projectVideoComposeInputs', () => {
  it('orders available video and audio seeds by vertical position', () => {
    const upstream = [
      node({ id: 'video-lower', type: CANVAS_NODE_TYPES.video, y: 80, url: '/b.mp4' }),
      node({ id: 'audio-top', type: CANVAS_NODE_TYPES.audio, y: 10, url: '/a.wav' }),
      node({ id: 'video-middle', type: CANVAS_NODE_TYPES.video, y: 40, url: '/a.mp4' }),
      node({ id: 'video-empty', type: CANVAS_NODE_TYPES.video, y: 0 }),
    ];

    expect(projectVideoComposeInputs(upstream)).toEqual({
      seedNodeIds: ['audio-top', 'video-middle', 'video-lower'],
      videoCount: 2,
      canOpen: true,
    });
    expect(upstream.map((item) => item.id)).toEqual([
      'video-lower',
      'audio-top',
      'video-middle',
      'video-empty',
    ]);
  });

  it('counts only playable videos toward the editor minimum', () => {
    const projection = projectVideoComposeInputs([
      node({ id: 'video-a', type: CANVAS_NODE_TYPES.video, y: 0, url: '/a.mp4' }),
      node({ id: 'audio-a', type: CANVAS_NODE_TYPES.audio, y: 10, url: '/a.wav' }),
      node({ id: 'audio-b', type: CANVAS_NODE_TYPES.audio, y: 20, url: '/b.wav' }),
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
    });
  });
});
