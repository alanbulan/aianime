// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  getStoryboardCellPreview,
  type StoryboardCellPreviewNode,
  type StoryboardCellPreviewPorts,
} from './storyboardCellPreview';

interface TestNode extends StoryboardCellPreviewNode {
  type: string;
  data: Record<string, unknown>;
}

const ports: StoryboardCellPreviewPorts<TestNode> = {
  types: {
    video: ['video'],
    storyboard: ['storyboard'],
    audio: ['audio'],
    script: ['script'],
    image: ['upload', 'image-edit', 'image-gen', 'export-image'],
  },
  resolveSourceImageUrl: (node) =>
    typeof node.data.imageUrl === 'string' ? node.data.imageUrl : null,
};

function node(
  type: string,
  data: Record<string, unknown>,
): TestNode {
  return {
    id: `node-${type}`,
    type,
    data,
  };
}

describe('storyboard cell preview', () => {
  it('preserves a video blob preview without URL adaptation', () => {
    const preview = getStoryboardCellPreview(
      node('video', {
        displayName: '视频片段',
        previewImageUrl: 'blob:video-preview',
      }),
      ports,
    );

    expect(preview).toEqual({
      imageUrl: 'blob:video-preview',
      kind: 'video',
      label: '视频片段',
      nodeId: 'node-video',
    });
  });

  it('uses the first storyboard frame and preserves static URLs', () => {
    const preview = getStoryboardCellPreview(
      node('storyboard', {
        frames: [
          {
            imageUrl: '/static/project/frame-1.png',
            previewImageUrl: 'data:image/png;base64,preview',
          },
        ],
      }),
      ports,
    );

    expect(preview.kind).toBe('image');
    expect(preview.imageUrl).toBe('/static/project/frame-1.png');
  });

  it('uses the supplied source resolver and keeps data URLs renderable', () => {
    const preview = getStoryboardCellPreview(
      node('upload', {
        imageUrl: 'data:image/png;base64,eA==',
      }),
      ports,
    );

    expect(preview.kind).toBe('image');
    expect(preview.imageUrl).toBe('data:image/png;base64,eA==');
  });
});
