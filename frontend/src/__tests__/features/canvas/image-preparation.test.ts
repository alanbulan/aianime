// Copyright (c) 2026 AI anime
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detectAspectRatio,
  prepareNodeImage,
  prepareNodeImageFromFile,
} from '@/features/canvas/application/imagePreparation';
import type { CanvasImageRuntimeGateway } from '@/features/canvas/application/ports';

const getDimensions = vi.fn();
const now = vi.fn();
const persist = vi.fn();
const preparePreview = vi.fn();
const readFileAsDataUrl = vi.fn();

const runtime: CanvasImageRuntimeGateway = {
  getDimensions: (sourceImage) => getDimensions(sourceImage),
  now: () => now(),
  persist: (sourceImage) => persist(sourceImage),
  preparePreview: (sourceImage, maxDimension) =>
    preparePreview(sourceImage, maxDimension),
  readFileAsDataUrl: (file) => readFileAsDataUrl(file),
};

const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

describe('Canvas image preparation', () => {
  beforeEach(() => {
    getDimensions.mockReset().mockResolvedValue({ height: 900, width: 1600 });
    now.mockReset().mockReturnValue(100);
    persist.mockReset().mockImplementation(async (source: string) => source);
    preparePreview.mockReset().mockResolvedValue({
      height: 900,
      normalizedDataUrl: 'data:image/png;base64,full',
      previewDataUrl: 'data:image/png;base64,preview',
      width: 1600,
    });
    readFileAsDataUrl.mockReset().mockResolvedValue('data:image/png;base64,file');
  });

  afterAll(() => {
    infoSpy.mockRestore();
  });

  it('persists the source and a distinct preview while assembling the image DTO', async () => {
    persist
      .mockResolvedValueOnce('persisted-source')
      .mockResolvedValueOnce('persisted-preview');

    await expect(prepareNodeImage(runtime, '  source-image  ', 32)).resolves.toEqual({
      aspectRatio: '16:9',
      imageUrl: 'persisted-source',
      previewImageUrl: 'persisted-preview',
    });

    expect(persist).toHaveBeenNthCalledWith(1, 'source-image');
    expect(preparePreview).toHaveBeenCalledWith('persisted-source', 64);
    expect(persist).toHaveBeenNthCalledWith(2, 'data:image/png;base64,preview');
  });

  it('reuses the persisted source when no scaled preview is needed', async () => {
    persist.mockResolvedValue('persisted-source');
    preparePreview.mockResolvedValue({
      height: 600,
      normalizedDataUrl: 'data:image/png;base64,same',
      previewDataUrl: 'data:image/png;base64,same',
      width: 800,
    });

    await expect(prepareNodeImage(runtime, 'source-image')).resolves.toEqual({
      aspectRatio: '4:3',
      imageUrl: 'persisted-source',
      previewImageUrl: 'persisted-source',
    });
    expect(persist).toHaveBeenCalledOnce();
  });

  it('keeps stable application errors for empty and unreadable sources', async () => {
    await expect(prepareNodeImage(runtime, '   ')).rejects.toMatchObject({
      details: 'imageUrl is empty',
      message: '未获取到可用图片结果',
    });

    preparePreview.mockRejectedValue(new Error('decode failed'));
    await expect(prepareNodeImage(runtime, 'broken-image')).rejects.toMatchObject({
      details: 'source=broken-image\ncause: decode failed',
      message: '生成结果无法解析为图片',
    });
  });

  it('reads a file through the runtime before running the same preparation flow', async () => {
    const file = new File(['image'], 'scene.png', { type: 'image/png' });

    await prepareNodeImageFromFile(runtime, file, 256);

    expect(readFileAsDataUrl).toHaveBeenCalledWith(file);
    expect(persist).toHaveBeenCalledWith('data:image/png;base64,file');
    expect(preparePreview).toHaveBeenCalledWith(
      'data:image/png;base64,file',
      256,
    );
  });

  it('reduces measured dimensions to an aspect ratio', async () => {
    await expect(detectAspectRatio(runtime, 'source-image')).resolves.toBe('16:9');
    expect(getDimensions).toHaveBeenCalledWith('source-image');
  });
});
