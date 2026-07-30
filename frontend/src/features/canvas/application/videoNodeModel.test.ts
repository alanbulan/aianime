// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  composeVideoNodePrompt,
  countVideoUpstreamMedia,
  countVideoUpstreamNodeTypes,
  hasVideoNodeGenerationError,
  planVideoAssetReferences,
  planVideoFrameSources,
  projectVideoReferenceMedia,
  resolveVideoFrameSeekSeconds,
  resolveVideoNodeAspectRatio,
  resolveVideoNodeDimensions,
  resolveVideoNodeDisplayedRect,
  resolveVideoNodeModel,
  resolveVideoNodePosterSource,
  resolveVideoNodeSource,
  resolveVideoNodeSubmitAspectRatio,
} from './videoNodeModel';
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '@/features/canvas/domain/canvasNodes';

function node(
  id: string,
  type: string,
  data: Record<string, unknown>,
  position = { x: 0, y: 0 },
): CanvasNode {
  return { id, type, data, position } as CanvasNode;
}

describe('videoNodeModel', () => {
  it('resolves the live model, node size, and persisted aspect ratios', () => {
    const models = [
      { id: 'model-a', apiModel: 'api-a' },
      { id: 'model-b', apiModel: 'api-b' },
    ];

    expect(resolveVideoNodeModel(models, 'model-b')).toBe(models[1]);
    expect(resolveVideoNodeModel(models, 'missing')).toBe(models[0]);
    expect(resolveVideoNodeDimensions(430.4, undefined)).toEqual({
      width: 480,
      height: 380,
    });
    expect(resolveVideoNodeAspectRatio('1248:704')).toBe('16:9');
    expect(
      resolveVideoNodeSubmitAspectRatio(
        { widthPx: 1080, heightPx: 1920 },
        'auto',
      ),
    ).toBe('9:16');
  });

  it('projects source, poster, failure state, and composed prompt', () => {
    expect(resolveVideoNodeSource('/result.mp4', '/local.mp4')).toBe(
      '/result.mp4',
    );
    expect(resolveVideoNodeSource(null, '/local.mp4')).toBe('/local.mp4');
    expect(resolveVideoNodePosterSource('/result.mp4')).toBe(
      '/result.mp4#t=0.1',
    );
    expect(resolveVideoNodePosterSource('/result.mp4#t=2')).toBe(
      '/result.mp4#t=2',
    );
    expect(
      hasVideoNodeGenerationError({
        isGenerating: false,
        videoUrl: null,
        generationError: '失败',
      }),
    ).toBe(true);
    expect(composeVideoNodePrompt('上游描述', '本地提示', '缓慢推进')).toBe(
      '缓慢推进，上游描述\n\n本地提示',
    );
  });

  it('projects contained-video geometry and capture seek positions', () => {
    expect(resolveVideoNodeDisplayedRect(600, 400, 1920, 1080)).toEqual({
      left: 0,
      top: 31.25,
      width: 600,
      height: 337.5,
    });
    expect(
      resolveVideoFrameSeekSeconds({
        mode: 'last',
        liveDuration: 5,
        fallbackDuration: 8,
        currentTime: 2,
      }),
    ).toBe(4.95);
    expect(
      resolveVideoFrameSeekSeconds({
        mode: 'current',
        liveDuration: null,
        fallbackDuration: null,
        currentTime: 2.5,
      }),
    ).toBe(2.5);
  });

  it('projects ordered media and distinguishes available media from node types', () => {
    const upstream = [
      node('video-a', CANVAS_NODE_TYPES.video, {
        videoUrl: '/video.mp4',
        previewImageUrl: '/poster.png',
      }),
      node('audio-a', CANVAS_NODE_TYPES.audio, {
        audioUrl: '/audio.mp3',
      }),
      node('image-a', CANVAS_NODE_TYPES.imageGen, {
        imageUrl: '/image.png',
      }),
      node('empty-image', CANVAS_NODE_TYPES.upload, {}),
    ];

    expect(projectVideoReferenceMedia(upstream)).toEqual([
      expect.objectContaining({ kind: 'video', nodeId: 'video-a' }),
      expect.objectContaining({ kind: 'audio', nodeId: 'audio-a' }),
      expect.objectContaining({ kind: 'image', nodeId: 'image-a' }),
    ]);
    expect(countVideoUpstreamMedia(upstream)).toEqual({
      images: 1,
      videos: 1,
      audios: 1,
    });
    expect(countVideoUpstreamNodeTypes(upstream)).toEqual({
      images: 2,
      videos: 1,
      audios: 1,
    });
  });

  it('plans collision-aware frame sources and the matching mode patch', () => {
    const target = node(
      'video-target',
      CANVAS_NODE_TYPES.video,
      {},
      { x: 1000, y: 200 },
    );
    target.height = 380;
    const blockingNode = node(
      'blocking',
      CANVAS_NODE_TYPES.imageGen,
      {},
      { x: 380, y: 210 },
    );
    blockingNode.width = 580;
    blockingNode.height = 360;

    const plan = planVideoFrameSources({
      mode: 'firstFrame',
      targetNode: target,
      nodes: [target, blockingNode],
      edges: [],
      prompt: '',
    });

    expect(plan.nodes).toEqual([
      expect.objectContaining({
        type: CANVAS_NODE_TYPES.imageGen,
        position: { x: 380, y: 594 },
      }),
    ]);
    expect(plan.groupLabel).toBe('首帧生成视频组');
    expect(plan.videoPatch).toEqual({
      genMode: 'allReference',
      prompt: '以当前图为首帧生成视频',
    });
  });

  it('plans image, video, and audio asset references in one centered column', () => {
    expect(
      planVideoAssetReferences({
        selections: [
          { media: 'image', url: '/image.png', name: '图' },
          { media: 'video', url: '/video.mp4', name: '视频' },
          { media: 'audio', url: '/audio.mp3', name: '音频' },
        ],
        targetPosition: { x: 1000, y: 200 },
        targetHeight: 380,
        aspectRatio: '16:9',
      }),
    ).toEqual([
      expect.objectContaining({
        type: CANVAS_NODE_TYPES.upload,
        position: { x: 640, y: 6 },
      }),
      expect.objectContaining({
        type: CANVAS_NODE_TYPES.video,
        data: expect.objectContaining({ referenceOnly: true }),
      }),
      expect.objectContaining({
        type: CANVAS_NODE_TYPES.audio,
        position: { x: 640, y: 534 },
      }),
    ]);
  });
});
