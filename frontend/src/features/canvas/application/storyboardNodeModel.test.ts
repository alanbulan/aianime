// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type StoryboardSplitNodeData,
} from '@/features/canvas/domain/canvasNodes';
import type { StoryboardFrameItem } from '@/modules/creative_canvas/public';

import {
  createDefaultStoryboardExportOptions,
  resolveDerivedAspectRatio,
  resolveStoryboardIncomingImages,
  resolveStoryboardNodeProjection,
  resolveStoryboardSplitNodeDimensions,
  storyboardAspectRatioCss,
} from './storyboardNodeModel';

function node(
  id: string,
  type: CanvasNode['type'],
  data: Record<string, unknown>,
): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  } as CanvasNode;
}

function frame(
  id: string,
  order: number,
  patch: Partial<StoryboardFrameItem> = {},
): StoryboardFrameItem {
  return {
    id,
    imageUrl: `/${id}.png`,
    note: '',
    order,
    ...patch,
  };
}

function data(
  patch: Partial<StoryboardSplitNodeData> = {},
): StoryboardSplitNodeData {
  return {
    aspectRatio: '16:9',
    gridRows: 2,
    gridCols: 3,
    frames: [],
    ...patch,
  };
}

describe('storyboardNodeModel', () => {
  it('keeps derived-node sizing and legacy node sizing deterministic', () => {
    expect(resolveStoryboardSplitNodeDimensions(2, 3, '16:9')).toEqual({
      width: 468,
      height: 320,
    });
    expect(resolveStoryboardSplitNodeDimensions(4, 2, '9:16')).toEqual({
      width: 440,
      height: 1600,
    });

    const projection = resolveStoryboardNodeProjection(
      data({
        frames: [
          frame('late', 2, { aspectRatio: '9:16' }),
          frame('first', 0),
        ],
      }),
      300,
      200,
    );
    expect(projection.orderedFrames.map((item) => item.id)).toEqual([
      'first',
      'late',
    ]);
    expect(projection.frameAspectRatio).toBe('9:16');
    expect(projection.frameAspectRatioCss).toBe('9 / 16');
    expect(projection.size).toEqual({ width: 440, height: 320 });
    expect(storyboardAspectRatioCss('invalid')).toBe('1 / 1');
  });

  it('normalizes export defaults and historical absolute font sizes', () => {
    const defaults = createDefaultStoryboardExportOptions();
    expect(defaults).toMatchObject({
      notePlacement: 'overlay',
      imageFit: 'cover',
      cellGap: 8,
      outerPadding: 0,
      fontSize: 4,
      backgroundColor: '#0f1115',
      textColor: '#f8fafc',
    });
    expect(
      resolveStoryboardNodeProjection(
        data({ exportOptions: { ...defaults, fontSize: 72 } }),
      ).exportOptions.fontSize,
    ).toBe(12);
  });

  it('uses source-specific aspect ratios and filters duplicate inputs', () => {
    expect(
      resolveDerivedAspectRatio(
        node('generated', CANVAS_NODE_TYPES.storyboardGen, {
          requestAspectRatio: '4:3',
          aspectRatio: '1:1',
        }),
        '16:9',
      ),
    ).toBe('4:3');
    expect(
      resolveDerivedAspectRatio(
        node('edit', CANVAS_NODE_TYPES.imageEdit, {
          requestAspectRatio: 'auto',
          aspectRatio: '3:2',
        }),
        '16:9',
      ),
    ).toBe('3:2');
    expect(resolveDerivedAspectRatio(undefined, '16:9')).toBe('16:9');

    expect(
      resolveStoryboardIncomingImages([
        node('upload', CANVAS_NODE_TYPES.upload, {
          imageUrl: '/same.png',
          previewImageUrl: '/same-preview.png',
        }),
        node('duplicate', CANVAS_NODE_TYPES.exportImage, {
          imageUrl: '/same.png',
        }),
        node('edit', CANVAS_NODE_TYPES.imageEdit, {
          imageUrl: '/edit.png',
        }),
        node('ignored', CANVAS_NODE_TYPES.script, {
          imageUrl: '/ignored.png',
        }),
      ]),
    ).toEqual([
      {
        imageUrl: '/same.png',
        previewImageUrl: '/same-preview.png',
        label: '图1',
      },
      {
        imageUrl: '/edit.png',
        previewImageUrl: null,
        label: '图2',
      },
    ]);
  });

});
