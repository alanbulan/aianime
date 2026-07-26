// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from 'vitest';

import { extractCanvasAssets } from './canvasAssets';
import { CANVAS_NODE_TYPES, type CanvasNode } from './canvasNodes';

function videoNode(
  id: string,
  videoUrl: string,
  previewImageUrl?: string,
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.video,
    position: { x: 0, y: 0 },
    data: { videoUrl, previewImageUrl },
  } as CanvasNode;
}

describe('Canvas assets', () => {
  it('resolves media through the caller and deduplicates canonical URLs', () => {
    const resolveMediaUrl = vi.fn((rawUrl: string | null | undefined) =>
      rawUrl?.replace('/legacy/', '/canonical/') ?? null,
    );

    const buckets = extractCanvasAssets(
      [
        videoNode('legacy', '/legacy/video.mp4', '/legacy/preview.png'),
        videoNode('canonical', '/canonical/video.mp4'),
      ],
      resolveMediaUrl,
    );

    expect(buckets.video).toEqual([
      expect.objectContaining({
        nodeId: 'legacy',
        url: '/canonical/video.mp4',
        previewUrl: '/canonical/preview.png',
      }),
    ]);
    expect(resolveMediaUrl).toHaveBeenCalledWith('/legacy/video.mp4');
    expect(resolveMediaUrl).toHaveBeenCalledWith('/legacy/preview.png');
    expect(resolveMediaUrl).toHaveBeenCalledWith('/canonical/video.mp4');
  });
});
