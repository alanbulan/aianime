// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
} from '@/features/canvas/domain/canvasNodes';
import { getStoryboardCellPreview } from '@/features/canvas/domain/storyboardCellPreview';

function canvasNode(
  type: CanvasNodeType,
  data: Record<string, unknown>,
): CanvasNode {
  return {
    data: data as CanvasNodeData,
    id: `node-${type}`,
    position: { x: 0, y: 0 },
    type,
  } as CanvasNode;
}

describe('storyboard cell preview', () => {
  it('preserves a video blob preview without application URL adaptation', () => {
    const preview = getStoryboardCellPreview(
      canvasNode(CANVAS_NODE_TYPES.video, {
        displayName: '视频片段',
        previewImageUrl: 'blob:video-preview',
      }),
    );

    expect(preview).toEqual({
      imageUrl: 'blob:video-preview',
      kind: 'video',
      label: '视频片段',
      nodeId: `node-${CANVAS_NODE_TYPES.video}`,
    });
  });

  it('uses the first storyboard frame and preserves static URLs', () => {
    const preview = getStoryboardCellPreview(
      canvasNode(CANVAS_NODE_TYPES.storyboardSplit, {
        frames: [
          {
            imageUrl: '/static/project/frame-1.png',
            previewImageUrl: 'data:image/png;base64,preview',
          },
        ],
      }),
    );

    expect(preview.kind).toBe('image');
    expect(preview.imageUrl).toBe('/static/project/frame-1.png');
  });

  it('falls back to the node image and keeps data URLs renderable', () => {
    const preview = getStoryboardCellPreview(
      canvasNode(CANVAS_NODE_TYPES.upload, {
        imageUrl: 'data:image/png;base64,eA==',
      }),
    );

    expect(preview.kind).toBe('image');
    expect(preview.imageUrl).toBe('data:image/png;base64,eA==');
  });
});
