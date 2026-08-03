// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CanvasAsset } from '../domain/canvasAsset';
import {
  useCanvasHistoryAssetController,
  type CanvasHistoryAssetControllerOptions,
} from './useCanvasHistoryAssetController';

function asset(): CanvasAsset {
  return {
    id: 'asset',
    kind: 'video',
    url: '/asset.mp4',
    previewUrl: '/preview.jpg',
    nodeId: 'source-node',
    label: 'Video',
    prompt: 'Prompt',
    timestamp: null,
  };
}

function createOptions(): CanvasHistoryAssetControllerOptions {
  return {
    getViewportCenter: vi.fn(() => ({ x: 100, y: 200 })),
    spawnAsset: vi.fn(() => 'spawned-node'),
    selectNode: vi.fn(),
    deleteNode: vi.fn(),
  };
}

describe('useCanvasHistoryAssetController', () => {
  it('spawns and selects a history asset at its planned batch position', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasHistoryAssetController(options),
    );

    act(() => result.current.useHistoryAsset(
      asset(),
      { index: 5, total: 6 },
    ));

    expect(options.getViewportCenter).toHaveBeenCalledOnce();
    expect(options.spawnAsset).toHaveBeenCalledWith(
      {
        kind: 'video',
        label: 'Video',
        prompt: 'Prompt',
        url: '/asset.mp4',
        coverUrl: null,
        restoreAsGeneratedImage: true,
        model: undefined,
        genMode: undefined,
        source: {},
      },
      { x: -60, y: 360 },
    );
    expect(options.selectNode).toHaveBeenCalledWith('spawned-node');
  });

  it('routes source-node deletion through the injected command', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasHistoryAssetController(options),
    );

    act(() => result.current.deleteHistoryNode('source-node'));

    expect(options.deleteNode).toHaveBeenCalledWith('source-node');
  });
});
