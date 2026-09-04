// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanvasImageSplitGateway,
  CanvasToolImageGateway,
  CanvasToolIdGenerator,
} from './canvasToolProcessor';
import { CanvasToolProcessor } from './canvasToolProcessor';
import { NODE_TOOL_TYPES } from '../domain/canvasNodeTool';

const annotateImage = vi.fn();
const cropImage = vi.fn();
const detectAspectRatio = vi.fn();
const getDimensions = vi.fn();
const nextId = vi.fn();
const persistImage = vi.fn();
const readStoryboardMetadata = vi.fn();
const splitImage = vi.fn();

const splitGateway: CanvasImageSplitGateway = {
  split: (sourceImage, rows, cols, lineThickness) =>
    splitImage(sourceImage, rows, cols, lineThickness),
};

const imageGateway: CanvasToolImageGateway = {
  annotate: (sourceImage, options) => annotateImage(sourceImage, options),
  crop: (sourceImage, options) => cropImage(sourceImage, options),
  detectAspectRatio: (sourceImage) => detectAspectRatio(sourceImage),
  getDimensions: (sourceImage) => getDimensions(sourceImage),
  persist: (sourceImage) => persistImage(sourceImage),
  readStoryboardMetadata: (sourceImage) =>
    readStoryboardMetadata(sourceImage),
};

const idGenerator: CanvasToolIdGenerator = {
  next: () => nextId(),
};

const processor = new CanvasToolProcessor(
  splitGateway,
  imageGateway,
  idGenerator,
);

describe('CanvasToolProcessor', () => {
  beforeEach(() => {
    let id = 0;
    annotateImage.mockReset().mockResolvedValue('annotated-image');
    cropImage.mockReset().mockResolvedValue('cropped-image');
    detectAspectRatio.mockReset().mockResolvedValue('4:3');
    getDimensions.mockReset().mockResolvedValue({ height: 600, width: 1200 });
    nextId.mockReset().mockImplementation(() => `frame-${++id}`);
    persistImage
      .mockReset()
      .mockImplementation(async (sourceImage: string) => `persisted:${sourceImage}`);
    readStoryboardMetadata.mockReset().mockResolvedValue(null);
    splitImage.mockReset().mockResolvedValue([]);
  });

  it('delegates crop without exposing browser drawing to application', async () => {
    const options = { aspectRatio: '16:9', cropX: 12 };

    await expect(
      processor.process(NODE_TOOL_TYPES.crop, 'source-image', options),
    ).resolves.toEqual({ outputImageUrl: 'cropped-image' });

    expect(cropImage).toHaveBeenCalledWith('source-image', options);
  });

  it('persists the annotation source before delegating drawing', async () => {
    const options = { text: '标注' };

    await expect(
      processor.process(NODE_TOOL_TYPES.annotate, 'source-image', options),
    ).resolves.toEqual({ outputImageUrl: 'annotated-image' });

    expect(persistImage).toHaveBeenCalledWith('source-image');
    expect(annotateImage).toHaveBeenCalledWith(
      'persisted:source-image',
      options,
    );
  });

  it('uses storyboard metadata and normalized percent thickness to assemble frames', async () => {
    readStoryboardMetadata.mockResolvedValue({
      frameNotes: [' 第一格 ', '第二格'],
      gridCols: 2,
      gridRows: 2,
    });
    splitImage.mockResolvedValue(['a', 'b', 'c', 'd']);

    const result = await processor.process(
      NODE_TOOL_TYPES.splitStoryboard,
      'storyboard-image',
      { lineThicknessPercent: 1 },
    );

    expect(splitImage).toHaveBeenCalledWith('storyboard-image', 2, 2, 6);
    expect(detectAspectRatio).toHaveBeenCalledWith('persisted:a');
    expect(result).toEqual({
      cols: 2,
      frameAspectRatio: '4:3',
      lineThicknessPercent: 1,
      lineThicknessPx: 6,
      rows: 2,
      storyboardFrames: [
        {
          aspectRatio: '4:3',
          id: 'frame-1',
          imageUrl: 'persisted:a',
          note: '第一格',
          order: 0,
          previewImageUrl: 'persisted:a',
        },
        {
          aspectRatio: '4:3',
          id: 'frame-2',
          imageUrl: 'persisted:b',
          note: '第二格',
          order: 1,
          previewImageUrl: 'persisted:b',
        },
        {
          aspectRatio: '4:3',
          id: 'frame-3',
          imageUrl: 'persisted:c',
          note: '',
          order: 2,
          previewImageUrl: 'persisted:c',
        },
        {
          aspectRatio: '4:3',
          id: 'frame-4',
          imageUrl: 'persisted:d',
          note: '',
          order: 3,
          previewImageUrl: 'persisted:d',
        },
      ],
    });
  });

  it('reports the canonical splitter failure instead of switching implementations', async () => {
    splitImage.mockRejectedValue(new Error('primary split unavailable'));

    await expect(
      processor.process(
        NODE_TOOL_TYPES.splitStoryboard,
        'storyboard-image',
        { cols: 3, lineThickness: 4, rows: 2 },
      ),
    ).rejects.toThrow('primary split unavailable');
  });

  it('clamps the legacy pixel thickness before both export and persistence', async () => {
    getDimensions.mockResolvedValue({ height: 8, width: 10 });

    const result = await processor.process(
      NODE_TOOL_TYPES.splitStoryboard,
      'storyboard-image',
      { cols: 3, lineThickness: 99, rows: 2 },
    );

    expect(splitImage).toHaveBeenCalledWith('storyboard-image', 2, 3, 3);
    expect(result.lineThicknessPx).toBe(3);
  });
});
