// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeData,
} from '../domain/canvasNodes';
import {
  createDefaultStoryboardExportOptions,
  resolveStoryboardSplitNodeDimensions,
  type StoryboardFrameItem,
} from '@/modules/creative_canvas/public';
import {
  createCanvasDerivedExportNode,
  createCanvasDerivedUploadNode,
  createCanvasStoryboardSplitNode,
} from './canvasDerivedNodeCreation';
import { resolveGeneratedImageNodeDimensions } from './imageNodeLayout';
import type { NodeFactory } from './ports';

function node(
  id: string,
  type: CanvasNode['type'],
  data: Record<string, unknown> = {},
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data, ...overrides } as CanvasNode;
}

function factory(): NodeFactory {
  return {
    createNode: (type, position, data: Partial<CanvasNodeData> = {}) => ({
      id: 'created',
      type,
      position,
      data: data as CanvasNodeData,
      style: { borderColor: 'red' },
    } as CanvasNode),
  };
}

describe('Canvas derived node creation', () => {
  it('creates a sized upload using the source aspect ratio', () => {
    const source = node('source', CANVAS_NODE_TYPES.storyboardGen, {
      requestAspectRatio: '4:3',
    }, {
      position: { x: 10, y: 20 },
    });
    const created = createCanvasDerivedUploadNode(
      [source],
      source.id,
      '/image.png',
      '16:9',
      undefined,
      factory(),
    );
    const size = resolveGeneratedImageNodeDimensions('4:3');

    expect(created).toMatchObject({
      type: CANVAS_NODE_TYPES.upload,
      position: { x: 430, y: 20 },
      data: {
        imageUrl: '/image.png',
        previewImageUrl: null,
        aspectRatio: '4:3',
      },
      width: size.width,
      height: size.height,
      style: { borderColor: 'red', ...size },
    });
  });

  it('creates an export with inherited aspect, source size, and result title', () => {
    const source = node('source', CANVAS_NODE_TYPES.storyboardSplit, {
      frameAspectRatio: '3:4',
    }, {
      measured: { width: 640.4, height: 480.4 },
    });
    const created = createCanvasDerivedExportNode({
      nodes: [source],
      sourceNodeId: source.id,
      imageUrl: '/result.png',
      aspectRatio: '16:9',
      options: {
        resultKind: 'matte',
        aspectRatioStrategy: 'derivedFromSource',
        matchSourceNodeSize: true,
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportSize: { width: 0, height: 0 },
    }, factory());

    expect(created).toMatchObject({
      type: CANVAS_NODE_TYPES.exportImage,
      data: {
        imageUrl: '/result.png',
        previewImageUrl: null,
        aspectRatio: '3:4',
        resultKind: 'matte',
        displayName: '抠图结果',
      },
      width: 640,
      height: 480,
      style: { borderColor: 'red', width: 640, height: 480 },
    });
  });

  it('creates a storyboard split using the first frame aspect ratio', () => {
    const source = node('source', CANVAS_NODE_TYPES.upload);
    const frames: StoryboardFrameItem[] = [
      {
        id: 'frame',
        imageUrl: '/frame.png',
        aspectRatio: '9:16',
        note: '',
        order: 0,
      },
    ];
    const created = createCanvasStoryboardSplitNode(
      [source],
      source.id,
      2,
      3,
      frames,
      undefined,
      factory(),
    );
    const size = resolveStoryboardSplitNodeDimensions(2, 3, '9:16');

    expect(created).toMatchObject({
      type: CANVAS_NODE_TYPES.storyboardSplit,
      data: {
        gridRows: 2,
        gridCols: 3,
        frames,
        aspectRatio: '9:16',
        frameAspectRatio: '9:16',
        exportOptions: createDefaultStoryboardExportOptions(),
      },
      width: size.width,
      height: size.height,
      style: { borderColor: 'red', ...size },
    });
  });
});
