// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from 'vitest';

import type {
  StoryboardExportOptions,
  StoryboardFrameItem,
} from '../domain/storyboard';

import {
  exportStoryboardGrid,
  packStoryboardFrames,
  type ExportStoryboardGridDependencies,
  type StoryboardMergeLayout,
} from './storyboardExport';

function frame(
  id: string,
  imageUrl: string | null,
  note = '',
): StoryboardFrameItem {
  return { id, imageUrl, note, order: 0 };
}

function layout(
  patch: Partial<StoryboardMergeLayout> = {},
): StoryboardMergeLayout {
  return {
    imagePath: '/merged.png',
    canvasWidth: 1600,
    canvasHeight: 900,
    cellWidth: 780,
    cellHeight: 440,
    gap: 8,
    padding: 0,
    noteHeight: 0,
    fontSize: 40,
    textOverlayApplied: true,
    ...patch,
  };
}

function dependencies(
  patch: Partial<ExportStoryboardGridDependencies> = {},
): ExportStoryboardGridDependencies {
  return {
    timestamp: vi.fn(() => 100),
    now: vi.fn(() => 0),
    getReferenceFrameHeight: vi.fn(async () => 1000),
    mergeImages: vi.fn(async () => layout()),
    applyTextOverlay: vi.fn(async () => 'data:image/png;base64,overlay'),
    persistImage: vi.fn(async () => '/persisted.png'),
    embedMetadata: vi.fn(async (source) => source),
    uploadImage: vi.fn(async () => '/uploaded.png'),
    info: vi.fn(),
    warn: vi.fn(),
    ...patch,
  };
}

function options(
  patch: Partial<StoryboardExportOptions> = {},
): StoryboardExportOptions {
  return {
    showFrameIndex: false,
    showFrameNote: false,
    notePlacement: 'overlay',
    imageFit: 'cover',
    frameIndexPrefix: 'S',
    cellGap: 8,
    outerPadding: 0,
    fontSize: 4,
    backgroundColor: 'black',
    textColor: 'white',
    ...patch,
  };
}

describe('storyboardExport', () => {
  it('merges with bounded dimensions and uploads the metadata result', async () => {
    const deps = dependencies({
      timestamp: vi.fn()
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(200),
      embedMetadata: vi.fn(async () => '/with-metadata.png'),
    });

    await expect(
      exportStoryboardGrid(
        {
          nodeId: 'storyboard-a',
          frames: [frame('a', '/a.png', '说明')],
          rows: 1,
          cols: 1,
          options: options({
            showFrameNote: true,
            notePlacement: 'bottom',
            cellGap: 999,
            outerPadding: 80,
          }),
        },
        deps,
      ),
    ).resolves.toEqual({ imageUrl: '/uploaded.png', aspectRatio: '16:9' });

    expect(deps.mergeImages).toHaveBeenCalledWith(
      expect.objectContaining({
        frameSources: ['/a.png'],
        cellGap: 120,
        outerPadding: 0,
        noteHeight: 68,
        fontSize: 40,
        maxDimension: 4096,
        frameNotes: ['说明'],
      }),
    );
    expect(deps.applyTextOverlay).not.toHaveBeenCalled();
    expect(deps.persistImage).not.toHaveBeenCalled();
    expect(deps.embedMetadata).toHaveBeenCalledWith('/merged.png', {
      gridRows: 1,
      gridCols: 1,
      frameNotes: ['说明'],
    });
    expect(deps.uploadImage).toHaveBeenCalledWith(
      '/with-metadata.png',
      'storyboard-export-storyboard-a-200.png',
    );
  });

  it('applies the browser overlay fallback and tolerates metadata failure', async () => {
    const metadataError = new Error('metadata unavailable');
    const deps = dependencies({
      getReferenceFrameHeight: vi.fn(async () => {
        throw new Error('image unavailable');
      }),
      mergeImages: vi.fn(async () =>
        layout({
          canvasWidth: 1000,
          canvasHeight: 1000,
          textOverlayApplied: false,
        }),
      ),
      embedMetadata: vi.fn(async () => {
        throw metadataError;
      }),
    });

    await expect(
      exportStoryboardGrid(
        {
          nodeId: 'storyboard-a',
          frames: [frame('a', '/a.png', '说明')],
          rows: 1,
          cols: 1,
          options: options({ showFrameIndex: true }),
        },
        deps,
      ),
    ).resolves.toEqual({ imageUrl: '/uploaded.png', aspectRatio: '1:1' });

    expect(deps.mergeImages).toHaveBeenCalledWith(
      expect.objectContaining({ fontSize: 41 }),
    );
    expect(deps.applyTextOverlay).toHaveBeenCalledWith(
      '/merged.png',
      expect.any(Array),
      expect.objectContaining({ showFrameIndex: true }),
      1,
      1,
      expect.objectContaining({ textOverlayApplied: false }),
    );
    expect(deps.persistImage).toHaveBeenCalledWith(
      'data:image/png;base64,overlay',
    );
    expect(deps.uploadImage).toHaveBeenCalledWith(
      '/persisted.png',
      expect.stringMatching(/^storyboard-export-storyboard-a-/),
    );
    expect(deps.warn).toHaveBeenCalledWith(
      '[StoryboardMetadata] embed failed on storyboard export',
      metadataError,
    );
  });

  it('rejects an export without any image source before merging', async () => {
    const deps = dependencies();
    await expect(
      exportStoryboardGrid(
        {
          nodeId: 'storyboard-a',
          frames: [frame('empty', null)],
          rows: 1,
          cols: 1,
          options: options(),
        },
        deps,
      ),
    ).rejects.toThrow('没有可导出的图片');
    expect(deps.mergeImages).not.toHaveBeenCalled();
  });

  it('packs available frames sequentially and rejects an empty pack', async () => {
    const saveImage = vi.fn(async () => undefined);
    await packStoryboardFrames(
      [
        frame('first', '/first.png', '第一格'),
        frame('empty', null),
        frame('third', '/third.png'),
      ],
      '项目 A',
      { saveImage },
    );
    expect(saveImage.mock.calls).toEqual([
      ['/first.png', 'downloads/项目 A', '项目 A_01_第一格'],
      ['/third.png', 'downloads/项目 A', '项目 A_03'],
    ]);

    await expect(
      packStoryboardFrames([frame('empty', null)], '项目 A', {
        saveImage,
      }),
    ).rejects.toThrow('该格没有可导出的图片');
  });

  it('sanitizes pack paths while preserving visible frame numbers', async () => {
    const saveImage = vi.fn(async () => undefined);

    await packStoryboardFrames(
      [
        frame('first', '/first.png', '第一 / 格*?'),
        frame('empty', null),
        frame('third', '/third.png'),
      ],
      '  漫剧:<A>.  ',
      { saveImage },
    );

    expect(saveImage.mock.calls).toEqual([
      ['/first.png', 'downloads/漫剧A', '漫剧A_01_第一 格'],
      ['/third.png', 'downloads/漫剧A', '漫剧A_03'],
    ]);
  });
});
