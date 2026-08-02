// Copyright (c) 2026 AI anime
import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanvasAsset,
  CanvasAssetBuckets,
} from '@/features/canvas/domain/canvasAssets';
import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';

import { useCanvasHistoryAssetsModalController } from './useCanvasHistoryAssetsModalController';

const mocks = vi.hoisted(() => ({
  nodes: [] as Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
  }>,
  records: [] as unknown[],
  isLoading: false,
  historyBuckets: null as CanvasAssetBuckets | null,
  liveBuckets: null as CanvasAssetBuckets | null,
  readHistory: vi.fn(),
  projectHistory: vi.fn(),
  extractLive: vi.fn(),
  download: vi.fn(),
  buildManifest: vi.fn(),
}));

vi.mock('@/features/canvas/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: { nodes: typeof mocks.nodes }) => unknown,
  ) => selector({ nodes: mocks.nodes }),
}));

vi.mock('@/modules/creative_canvas/public', () => ({
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

vi.mock(
  '@/features/canvas/application/generationHistoryAssets',
  () => ({
    recordsToAssetBuckets: (...args: unknown[]) => {
      mocks.projectHistory(...args);
      return mocks.historyBuckets;
    },
  }),
);

vi.mock(
  '@/features/canvas/domain/canvasAssets',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('@/features/canvas/domain/canvasAssets')
      >();
    return {
      ...original,
      extractCanvasAssets: (...args: unknown[]) => {
        mocks.extractLive(...args);
        return mocks.liveBuckets;
      },
    };
  },
);

vi.mock('@/lib/browserDownload', () => ({
  downloadUrlAsFile: (url: string) => mocks.download(url),
}));

vi.mock('@/lib/media-url', () => ({
  resolveMediaUrl: (url: string | null | undefined) => url ?? null,
}));

vi.mock('@/features/viewer-kit/three-d/directorManifest', () => ({
  buildStandaloneWorldManifest: (input: unknown) =>
    mocks.buildManifest(input),
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

describe('useCanvasHistoryAssetsModalController', () => {
  beforeEach(() => {
    mocks.nodes = [];
    mocks.records = [];
    mocks.isLoading = false;
    mocks.historyBuckets = buckets();
    mocks.liveBuckets = buckets();
    mocks.readHistory.mockReset();
    mocks.projectHistory.mockReset();
    mocks.extractLive.mockReset();
    mocks.download.mockReset().mockResolvedValue(undefined);
    mocks.buildManifest.mockReset().mockReturnValue({ id: 'world-manifest' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('queries only generative nodes and projects history metadata in the controller', () => {
    const historyImage = asset('history-image');
    mocks.historyBuckets = buckets({ image: [historyImage] });
    mocks.records = [{ id: 'record-a' }];
    mocks.nodes = [
      {
        id: 'generated-image',
        type: CANVAS_NODE_TYPES.imageGen,
        data: {},
      },
      {
        id: 'world-a',
        type: CANVAS_NODE_TYPES.threeDWorld,
        data: {
          previewImageUrl: '/world-cover.png',
          sourceNodeId: 'source-a',
        },
      },
      {
        id: 'source-a',
        type: CANVAS_NODE_TYPES.upload,
        data: { displayName: '大学宿舍' },
      },
    ];

    const { result } = renderHook(() =>
      useCanvasHistoryAssetsModalController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        onClose: vi.fn(),
        onUseAsset: vi.fn(),
        onDeleteNode: vi.fn(),
      }),
    );

    expect(mocks.readHistory).toHaveBeenCalledWith(
      { projectId: 'project-a', canvasId: 'canvas-a' },
      ['generated-image', 'world-a'],
      { enabled: true },
    );
    expect(mocks.projectHistory).toHaveBeenCalledOnce();
    const resolveNodeMeta = mocks.projectHistory.mock.calls[0]?.[1] as (
      nodeId: string,
    ) => { cover: string | null; name: string | null };
    expect(resolveNodeMeta('world-a')).toEqual({
      cover: '/world-cover.png',
      name: '大学宿舍',
    });
    expect(result.current.activeAssets).toEqual([historyImage]);
    expect(result.current.groups[0]?.assets).toEqual([historyImage]);
    expect(mocks.extractLive).not.toHaveBeenCalled();
  });

  it('uses live-canvas buckets without enabling the history query', () => {
    const liveImage = asset('live-image');
    mocks.liveBuckets = buckets({ image: [liveImage] });
    mocks.nodes = [
      {
        id: 'upload-a',
        type: CANVAS_NODE_TYPES.upload,
        data: { imageUrl: '/live-image' },
      },
    ];

    const { result } = renderHook(() =>
      useCanvasHistoryAssetsModalController({
        projectId: 'project-a',
        canvasId: null,
        onClose: vi.fn(),
        onUseAsset: vi.fn(),
        onDeleteNode: vi.fn(),
        imageOnly: true,
        assetSource: 'live-canvas',
      }),
    );

    expect(mocks.readHistory).toHaveBeenCalledWith(
      { projectId: 'project-a', canvasId: null },
      [],
      { enabled: false },
    );
    expect(mocks.extractLive).toHaveBeenCalledOnce();
    expect(mocks.projectHistory).not.toHaveBeenCalled();
    expect(result.current.tabOrder).toEqual(['image']);
    expect(result.current.activeAssets).toEqual([liveImage]);
  });

  it('owns selection, tab reset, single use, deletion, and grid batch use', async () => {
    const first = asset('first');
    const second = asset('second');
    const video = asset('video', 'video');
    mocks.historyBuckets = buckets({ image: [first, second], video: [video] });
    const onClose = vi.fn();
    const onUseAsset = vi.fn();
    const onDeleteNode = vi.fn();
    const { result } = renderHook(() =>
      useCanvasHistoryAssetsModalController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        onClose,
        onUseAsset,
        onDeleteNode,
      }),
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

  it('owns image, video, world, prompt, and Escape lifecycles', () => {
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
      useCanvasHistoryAssetsModalController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        onClose,
        onUseAsset: vi.fn(),
        onDeleteNode: vi.fn(),
      }),
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
    expect(mocks.buildManifest).toHaveBeenCalledWith({
      project: 'project-a',
      url: '/world',
      displayName: 'label-world',
    });
    expect(result.current.worldManifest).toEqual({ id: 'world-manifest' });
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
    const { result } = renderHook(() =>
      useCanvasHistoryAssetsModalController({
        projectId: 'project-a',
        canvasId: 'canvas-a',
        onClose: vi.fn(),
        onUseAsset: vi.fn(),
        onDeleteNode: vi.fn(),
      }),
    );

    act(() => result.current.toggleAssetSelection(second));
    act(() => result.current.toggleAssetSelection(first));
    await act(async () => {
      const pending = result.current.downloadSelected();
      await vi.runAllTimersAsync();
      await pending;
    });

    expect(mocks.download.mock.calls).toEqual([['/first'], ['/second']]);
    expect(result.current.isDownloading).toBe(false);
  });
});
