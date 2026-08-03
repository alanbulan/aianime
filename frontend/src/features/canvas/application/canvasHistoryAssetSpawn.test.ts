// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type { CanvasAsset } from '@/modules/creative_canvas/public';
import {
  createCanvasHistoryAssetPayload,
  resolveCanvasHistoryAssetPosition,
} from './canvasHistoryAssetSpawn';

function asset(overrides: Partial<CanvasAsset> = {}): CanvasAsset {
  return {
    id: 'asset',
    kind: 'image',
    url: '/asset.png',
    previewUrl: '/preview.png',
    nodeId: 'source-node',
    label: 'Asset',
    timestamp: null,
    ...overrides,
  };
}

describe('canvasHistoryAssetSpawn', () => {
  it('maps history metadata to a generated-asset payload', () => {
    expect(createCanvasHistoryAssetPayload(asset({
      prompt: 'Prompt',
      model: 'image-model',
      genMode: 'quality',
    }))).toEqual({
      kind: 'image',
      label: 'Asset',
      prompt: 'Prompt',
      url: '/asset.png',
      coverUrl: null,
      restoreAsGeneratedImage: true,
      model: 'image-model',
      genMode: 'quality',
      source: {},
    });
  });

  it('uses the preview only as a model cover and normalizes nullable fields', () => {
    expect(createCanvasHistoryAssetPayload(asset({
      kind: 'model',
      label: null,
      prompt: null,
      model: null,
      genMode: null,
    }))).toEqual({
      kind: 'model',
      label: '',
      prompt: undefined,
      url: '/asset.png',
      coverUrl: '/preview.png',
      restoreAsGeneratedImage: true,
      model: undefined,
      genMode: undefined,
      source: {},
    });
  });

  it('keeps a single asset at the viewport center', () => {
    expect(resolveCanvasHistoryAssetPosition(
      { x: 100, y: 200 },
      { index: 0, total: 1 },
    )).toEqual({ x: 100, y: 200 });
  });

  it('centers batches on a grid with at most four columns', () => {
    expect(resolveCanvasHistoryAssetPosition(
      { x: 100, y: 200 },
      { index: 5, total: 6 },
    )).toEqual({ x: -60, y: 360 });
  });
});
