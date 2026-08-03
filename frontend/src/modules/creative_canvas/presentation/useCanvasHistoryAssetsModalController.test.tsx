// Copyright (c) 2026 AI anime
import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanvasAsset,
  CanvasAssetBuckets,
  CanvasMediaUrlResolver,
} from '../domain/canvasAsset';
import {
  useCanvasHistoryAssetsModalController,
  type CanvasHistoryAssetsModalControllerOptions,
} from './useCanvasHistoryAssetsModalController';

const mocks = vi.hoisted(() => ({
  records: [] as unknown[],
  isLoading: false,
  historyBuckets: null as CanvasAssetBuckets | null,
  readHistory: vi.fn(),
  projectHistory: vi.fn(),
}));

vi.mock('./useCanvasGenerationHistory', () => ({
  useCanvasGenerationHistory: (
    context: { projectId: string; canvasId: string | null },
    nodeIds: string[],
    options: { enabled: boolean },
  ) => {
    mocks.readHistory(context, nodeIds, options);
    return {
      records: mocks.records,
      isLoading: mocks.isLoading,
      error: null,
      refresh: vi.fn(),
    };
  },
}));

vi.mock('../application/generationHistoryAssets', () => ({
  recordsToAssetBuckets: (...args: unknown[]) => {
    mocks.projectHistory(...args);
    return mocks.historyBuckets;
  },
}));

function asset(
  id: string,
  kind: CanvasAsset['kind'] = 'image',
  timestamp = Date.parse('2026-07-30T10:00:00Z'),
): CanvasAsset {
  return {
    id,
    kind,
    url: `/${id}`,
    previewUrl: null,
    nodeId: `node-${id}`,
    label: `label-${id}`,
    prompt: `prompt-${id}`,
    timestamp,
  };
}

function buckets(
  overrides: Partial<CanvasAssetBuckets> = {},
): CanvasAssetBuckets {
  return {
    image: [],
    video: [],
    audio: [],
    model: [],
    ...overrides,
  };
}

function options(
  overrides: Partial<CanvasHistoryAssetsModalControllerOptions> = {},
): CanvasHistoryAssetsModalControllerOptions {
  return {
    projectId: 'project-a',
    canvasId: 'canvas-a',
    onClose: vi.fn(),
    onUseAsset: vi.fn(),
    onDeleteNode: vi.fn(),
    historyNodeIds: ['generated-image', 'world-a'],
    resolveNodeMeta: vi.fn(() => ({ cover: null, name: null })),
    liveAssetBuckets: buckets(),
    resolveMediaUrl: ((url) => url ?? null) as CanvasMediaUrlResolver,
    downloadAsset: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('useCanvasHistoryAssetsModalController', () => {
  beforeEach(() => {
    mocks.records = [];
    mocks.isLoading = false;
    mocks.historyBuckets = buckets();
    mocks.readHistory.mockReset();
    mocks.projectHistory.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('queries the injected node set and projects history through module ports', () => {
    const historyImage = asset('history-image');
    mocks.historyBuckets = buckets({ image: [historyImage] });
    mocks.records = [{ id: 'record-a' }];
    const resolveNodeMeta = vi.fn(() => ({
      cover: '/world-cover.png',
      name: '大学宿舍',
    }));
    const resolveMediaUrl = vi.fn((url: string | null | undefined) =>
      url ?? null,
    );

    const { result } = renderHook(() =>
      useCanvasHistoryAssetsModalController(
        options({ resolveNodeMeta, resolveMediaUrl }),
      ),
    );

    expect(mocks.readHistory).toHaveBeenCalledWith(
      { projectId: 'project-a', canvasId: 'canvas-a' },
      ['generated-image', 'world-a'],
      { enabled: true },
    );
    expect(mocks.projectHistory).toHaveBeenCalledWith(
      mocks.records,
      resolveNodeMeta,
      resolveMediaUrl,
    );
    expect(result.current.activeAssets).toEqual([historyImage]);
    expect(result.current.groups[0]?.assets).toEqual([historyImage]);
  });

  it('uses live-canvas buckets without enabling history', () => {
    const liveImage = asset('live-image');
    const liveAssetBuckets = buckets({ image: [liveImage] });

    const { result } = renderHook(() =>
      useCanvasHistoryAssetsModalController(
        options({
          canvasId: null,
          imageOnly: true,
          assetSource: 'live-canvas',
          liveAssetBuckets,
        }),
      ),
    );

    expect(mocks.readHistory).toHaveBeenCalledWith(
      { projectId: 'project-a', canvasId: null },
      ['generated-image', 'world-a'],
      { enabled: false },
    );
    expect(mocks.projectHistory).not.toHaveBeenCalled();
    expect(result.current.tabOrder).toEqual(['image']);
    expect(result.current.activeAssets).toEqual([liveImage]);
  });

  it('owns selection, tab reset, single use, deletion, and batch use', async () => {
    const first = asset('first');
    const second = asset('second');
    const video = asset('video', 'video');
    mocks.historyBuckets = buckets({ image: [first, second], video: [video] });
    const onClose = vi.fn();
    const onUseAsset = vi.fn();
    const onDeleteNode = vi.fn();
    const { result } = renderHook(() =>
      useCanvasHistoryAssetsModalController(
        options({ onClose, onUseAsset, onDeleteNode }),
      ),
    );

    act(() => result.current.toggleSelectionMode());
    act(() => result.current.toggleAssetSelection(first));
    act(() => result.current.toggleAssetSelection(second));
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.allSelected).toBe(true);
    act(() => result.current.useSelected());
    expect(onUseAsset.mock.calls).toEqual([
      [first, { index: 0, total: 2 }],
      [second, { index: 1, total: 2 }],
    ]);
    expect(onClose).toHaveBeenCalledOnce();

    act(() => result.current.deleteAsset(first));
    expect(onDeleteNode).toHaveBeenCalledWith(first.nodeId);
    act(() => result.current.useAsset(second));
    expect(onUseAsset).toHaveBeenLastCalledWith(second);
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => result.current.selectTab('video'));
    await waitFor(() => expect(result.current.selectedCount).toBe(0));
    expect(result.current.activeAssets).toEqual([video]);
  });

  it('owns image, video, world request, prompt, and Escape lifecycles', () => {
    const first = asset('first');
    const second = asset('second', 'image', Date.parse('2026-07-30T11:00:00Z'));
    const video = asset('video', 'video');
    const world = asset('world', 'model');
    mocks.historyBuckets = buckets({
      image: [first, second],
      video: [video],
      model: [world],
    });
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCanvasHistoryAssetsModalController(options({ onClose })),
    );

    act(() => result.current.viewAsset(first, '导演世界'));
    expect(result.current.imageViewerIndex).toBe(1);
    act(() => result.current.navigateImageViewer('prev'));
    expect(result.current.imageViewerIndex).toBe(0);
    act(() => result.current.closeImageViewer());

    act(() => result.current.viewAsset(video, '导演世界'));
    expect(result.current.videoViewerUrl).toBe('/video');
    act(() => result.current.closeVideoViewer());

    act(() => result.current.viewAsset(world, '导演世界'));
    expect(result.current.worldViewerRequest).toEqual({
      projectId: 'project-a',
      url: '/world',
      displayName: 'label-world',
    });
    act(() => result.current.setWorldViewerOpen(false));

    act(() => result.current.openPromptDialog('完整提示词'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(result.current.promptDialogText).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('downloads selected assets in display order and restores idle state', async () => {
    vi.useFakeTimers();
    const first = asset('first');
    const second = asset('second');
    mocks.historyBuckets = buckets({ image: [first, second] });
    const downloadAsset = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useCanvasHistoryAssetsModalController(options({ downloadAsset })),
    );

    act(() => result.current.toggleAssetSelection(second));
    act(() => result.current.toggleAssetSelection(first));
    await act(async () => {
      const pending = result.current.downloadSelected();
      await vi.runAllTimersAsync();
      await pending;
    });

    expect(downloadAsset.mock.calls).toEqual([['/first'], ['/second']]);
    expect(result.current.isDownloading).toBe(false);
  });
});
