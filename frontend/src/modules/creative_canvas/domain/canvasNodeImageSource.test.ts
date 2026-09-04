// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { CANVAS_CONNECTION_NODE_TYPES } from './canvasConnection';
import {
  isCanvasToolImageSourceNode,
  resolveCanvasNodeSourceImageUrl,
} from './canvasNodeImageSource';

describe('canvasNodeImageSource', () => {
  it('resolves the currently displayed preview for regular image source nodes', () => {
    const node = {
      type: CANVAS_CONNECTION_NODE_TYPES.upload,
      data: {
        imageUrl: 'image-url',
        previewImageUrl: 'preview-url',
      },
    };

    expect(isCanvasToolImageSourceNode(node)).toBe(true);
    expect(resolveCanvasNodeSourceImageUrl(node)).toBe('preview-url');
  });

  it('uses the image generation display and reference fallbacks in order', () => {
    const type = CANVAS_CONNECTION_NODE_TYPES.imageGen;

    expect(resolveCanvasNodeSourceImageUrl({
      type,
      data: { imageUrl: 'image-url', previewImageUrl: 'preview-url' },
    })).toBe('preview-url');
    expect(resolveCanvasNodeSourceImageUrl({
      type,
      data: { previewImageUrl: 'preview-url', referenceImageUrl: 'reference-url' },
    })).toBe('preview-url');
    expect(resolveCanvasNodeSourceImageUrl({
      type,
      data: { referenceImageUrl: 'reference-url' },
    })).toBe('reference-url');
  });

  it('rejects unsupported and empty image sources', () => {
    const videoNode = {
      type: CANVAS_CONNECTION_NODE_TYPES.video,
      data: { imageUrl: 'poster-url' },
    };

    expect(isCanvasToolImageSourceNode(videoNode)).toBe(false);
    expect(resolveCanvasNodeSourceImageUrl(videoNode)).toBeNull();
    expect(resolveCanvasNodeSourceImageUrl(null)).toBeNull();
  });
});
