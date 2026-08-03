// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CanvasAsset } from '../domain/canvasAsset';
import type { CanvasHistoryAssetsModalController } from './useCanvasHistoryAssetsModalController';

import { CanvasHistoryAssetsModalView } from './CanvasHistoryAssetsModalView';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { n?: number }) =>
      values?.n === undefined ? key : `${key}:${values.n}`,
  }),
}));

vi.mock('./CanvasHistoryAssetCard', () => ({
  CanvasHistoryAssetCard: ({
    asset,
    onToggleSelect,
    onView,
    onUse,
    onDelete,
    onOpenPrompt,
  }: {
    asset: CanvasAsset;
    onToggleSelect: () => void;
    onView: () => void;
    onUse: () => void;
    onDelete: () => void;
    onOpenPrompt?: () => void;
  }) => (
    <div data-testid={`asset-${asset.id}`}>
      <button type="button" onClick={onToggleSelect}>toggle-{asset.id}</button>
      <button type="button" onClick={onView}>view-{asset.id}</button>
      <button type="button" onClick={onUse}>use-{asset.id}</button>
      <button type="button" onClick={onDelete}>delete-{asset.id}</button>
      {onOpenPrompt && (
        <button type="button" onClick={onOpenPrompt}>prompt-{asset.id}</button>
      )}
    </div>
  ),
}));

function ViewerLayer({
  controller: value,
}: {
  controller: CanvasHistoryAssetsModalController;
}) {
  return (
    <>
      {value.imageViewerIndex !== null ? (
        <>
          <button type="button" onClick={value.closeImageViewer}>
            close-image-viewer
          </button>
          <button
            type="button"
            onClick={() => value.navigateImageViewer('next')}
          >
            next-image
          </button>
        </>
      ) : null}
      {value.videoViewerUrl ? (
        <button type="button" onClick={value.closeVideoViewer}>
          close-video-viewer
        </button>
      ) : null}
      {value.worldViewerRequest ? (
        <button type="button" onClick={() => value.setWorldViewerOpen(false)}>
          close-world-viewer
        </button>
      ) : null}
    </>
  );
}

function asset(id: string): CanvasAsset {
  return {
    id,
    kind: 'image',
    url: `/${id}.png`,
    previewUrl: null,
    nodeId: `node-${id}`,
    label: `label-${id}`,
    prompt: `prompt-${id}`,
    timestamp: Date.parse('2026-07-30T10:00:00Z'),
  };
}

function controller(
  overrides: Partial<CanvasHistoryAssetsModalController> = {},
): CanvasHistoryAssetsModalController {
  const image = asset('image-a');
  const buckets = { image: [image], video: [], audio: [], model: [] };
  return {
    onClose: vi.fn(),
    useHistory: true,
    isLoading: false,
    tabOrder: ['image', 'video', 'audio', 'model'],
    buckets,
    activeTab: 'image',
    selectTab: vi.fn(),
    direction: 'desc',
    toggleDirection: vi.fn(),
    zoom: 100,
    zoomOut: vi.fn(),
    zoomIn: vi.fn(),
    selectionMode: false,
    selectedIds: new Set(),
    selectedIdCount: 0,
    selectedCount: 0,
    allSelected: false,
    toggleSelectionMode: vi.fn(),
    toggleAssetSelection: vi.fn(),
    toggleSelectAll: vi.fn(),
    activeAssets: [image],
    groups: [{ date: '2026-07-30', assets: [image] }],
    thumbPx: 256,
    viewAsset: vi.fn(),
    useAsset: vi.fn(),
    deleteAsset: vi.fn(),
    isDownloading: false,
    downloadSelected: vi.fn(async () => undefined),
    useSelected: vi.fn(),
    imageViewerIndex: null,
    orderedImageUrls: ['/image-a.png'],
    closeImageViewer: vi.fn(),
    navigateImageViewer: vi.fn(),
    videoViewerUrl: null,
    closeVideoViewer: vi.fn(),
    worldViewerRequest: null,
    setWorldViewerOpen: vi.fn(),
    promptDialogText: null,
    openPromptDialog: vi.fn(),
    closePromptDialog: vi.fn(),
    ...overrides,
  } as CanvasHistoryAssetsModalController;
}

describe('CanvasHistoryAssetsModalView', () => {
  it('renders buckets and forwards toolbar and card commands', () => {
    const selectTab = vi.fn();
    const toggleDirection = vi.fn();
    const zoomOut = vi.fn();
    const zoomIn = vi.fn();
    const toggleSelectionMode = vi.fn();
    const toggleAssetSelection = vi.fn();
    const viewAsset = vi.fn();
    const useAsset = vi.fn();
    const deleteAsset = vi.fn();
    const openPromptDialog = vi.fn();
    render(
      <CanvasHistoryAssetsModalView
        ViewerLayer={ViewerLayer}
        controller={controller({
          selectTab,
          toggleDirection,
          zoomOut,
          zoomIn,
          toggleSelectionMode,
          toggleAssetSelection,
          viewAsset,
          useAsset,
          deleteAsset,
          openPromptDialog,
        })}
      />,
    );

    expect(screen.getByText('canvas.history.tabs.image(1)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('canvas.history.tabs.video(0)'));
    fireEvent.click(screen.getByText('canvas.history.sortDesc'));
    fireEvent.click(screen.getByLabelText('canvas.toolbar.zoomOut'));
    fireEvent.click(screen.getByLabelText('canvas.toolbar.zoomIn'));
    fireEvent.click(screen.getByText('canvas.history.batch'));
    fireEvent.click(screen.getByText('toggle-image-a'));
    fireEvent.click(screen.getByText('view-image-a'));
    fireEvent.click(screen.getByText('use-image-a'));
    fireEvent.click(screen.getByText('delete-image-a'));
    fireEvent.click(screen.getByText('prompt-image-a'));

    expect(selectTab).toHaveBeenCalledWith('video');
    expect(toggleDirection).toHaveBeenCalledOnce();
    expect(zoomOut).toHaveBeenCalledOnce();
    expect(zoomIn).toHaveBeenCalledOnce();
    expect(toggleSelectionMode).toHaveBeenCalledOnce();
    expect(toggleAssetSelection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'image-a' }),
    );
    expect(viewAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'image-a' }),
      'viewer.threeD.directorWorld',
    );
    expect(useAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'image-a' }),
    );
    expect(deleteAsset).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'image-a' }),
    );
    expect(openPromptDialog).toHaveBeenCalledWith('label-image-a');
  });

  it('forwards batch actions and all nested viewer lifecycles', () => {
    const toggleSelectAll = vi.fn();
    const downloadSelected = vi.fn(async () => undefined);
    const useSelected = vi.fn();
    const closeImageViewer = vi.fn();
    const navigateImageViewer = vi.fn();
    const closeVideoViewer = vi.fn();
    const setWorldViewerOpen = vi.fn();
    const closePromptDialog = vi.fn();
    render(
      <CanvasHistoryAssetsModalView
        ViewerLayer={ViewerLayer}
        controller={controller({
          selectionMode: true,
          selectedIds: new Set(['image-a']),
          selectedIdCount: 1,
          selectedCount: 1,
          allSelected: true,
          toggleSelectAll,
          downloadSelected,
          useSelected,
          imageViewerIndex: 0,
          closeImageViewer,
          navigateImageViewer,
          videoViewerUrl: '/video-a.mp4',
          closeVideoViewer,
          worldViewerRequest: {
            projectId: 'project-a',
            url: '/world-a.sog',
            displayName: 'world-a',
          },
          setWorldViewerOpen,
          promptDialogText: '完整提示词',
          closePromptDialog,
        })}
      />,
    );

    fireEvent.click(screen.getByText('canvas.history.deselectAll'));
    fireEvent.click(screen.getByText('canvas.history.batchDownload'));
    fireEvent.click(screen.getByText('canvas.history.batchUse'));
    fireEvent.click(screen.getByText('close-image-viewer'));
    fireEvent.click(screen.getByText('next-image'));
    fireEvent.click(screen.getByText('close-video-viewer'));
    fireEvent.click(screen.getByText('close-world-viewer'));
    const closeButtons = screen.getAllByLabelText('common.close');
    fireEvent.click(closeButtons[closeButtons.length - 1]!);

    expect(toggleSelectAll).toHaveBeenCalledOnce();
    expect(downloadSelected).toHaveBeenCalledOnce();
    expect(useSelected).toHaveBeenCalledOnce();
    expect(closeImageViewer).toHaveBeenCalledOnce();
    expect(navigateImageViewer).toHaveBeenCalledWith('next');
    expect(closeVideoViewer).toHaveBeenCalledOnce();
    expect(setWorldViewerOpen).toHaveBeenCalledWith(false);
    expect(closePromptDialog).toHaveBeenCalledOnce();
  });

  it('keeps loading and empty states mutually exclusive', () => {
    const emptyBuckets = { image: [], video: [], audio: [], model: [] };
    const { rerender } = render(
      <CanvasHistoryAssetsModalView
        ViewerLayer={ViewerLayer}
        controller={controller({
          isLoading: true,
          buckets: emptyBuckets,
          activeAssets: [],
          groups: [],
        })}
      />,
    );
    expect(screen.getByText('common.loading')).toBeInTheDocument();

    rerender(
      <CanvasHistoryAssetsModalView
        ViewerLayer={ViewerLayer}
        controller={controller({
          useHistory: false,
          isLoading: true,
          buckets: emptyBuckets,
          activeAssets: [],
          groups: [],
        })}
      />,
    );
    expect(screen.getByText('canvas.history.empty')).toBeInTheDocument();
  });
});
