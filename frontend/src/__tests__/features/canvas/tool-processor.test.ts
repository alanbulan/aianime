// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanvasToolImageGateway,
  IdGenerator,
  ImageSplitGateway,
} from '@/features/canvas/application/ports';
import { CanvasToolProcessor } from '@/features/canvas/application/toolProcessor';
import { NODE_TOOL_TYPES } from '@/modules/creative_canvas/public';

const annotateImage = vi.fn();
const cropImage = vi.fn();
const detectAspectRatio = vi.fn();
const getDimensions = vi.fn();
const nextId = vi.fn();
const persistImage = vi.fn();
const readStoryboardMetadata = vi.fn();
const splitImage = vi.fn();
const splitImageLocally = vi.fn();

const splitGateway: ImageSplitGateway = {
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
  splitLocally: (sourceImage, rows, cols, lineThickness) =>
    splitImageLocally(sourceImage, rows, cols, lineThickness),
};

const idGenerator: IdGenerator = {
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
    splitImageLocally.mockReset().mockResolvedValue([]);
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
    expect(splitImageLocally).not.toHaveBeenCalled();
    expect(detectAspectRatio).toHaveBeenCalledWith('persisted:a');
    expect(result).toEqual({
      cols: 2,
      frameAspectRatio: '4:3',
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

  it('uses the browser split fallback and ratio fallback when primary processing fails', async () => {
    splitImage.mockRejectedValue(new Error('primary split unavailable'));
    splitImageLocally.mockResolvedValue(['fallback-frame']);
    detectAspectRatio.mockRejectedValue(new Error('ratio unavailable'));

    const result = await processor.process(
      NODE_TOOL_TYPES.splitStoryboard,
      'storyboard-image',
      { cols: 3, lineThickness: 4, rows: 2 },
    );

    expect(getDimensions).not.toHaveBeenCalled();
    expect(splitImageLocally).toHaveBeenCalledWith(
      'storyboard-image',
      2,
      3,
      4,
    );
    expect(result.frameAspectRatio).toBe('3:2');
    expect(result.storyboardFrames?.[0]).toEqual(
      expect.objectContaining({
        aspectRatio: '3:2',
        imageUrl: 'persisted:fallback-frame',
      }),
    );
  });
});
