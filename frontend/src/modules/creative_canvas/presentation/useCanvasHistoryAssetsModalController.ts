// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CanvasHistoryAssetPlacement } from '../application/canvasHistoryAssetSpawn';
import {
  recordsToAssetBuckets,
  type HistoryNodeMeta,
} from '../application/generationHistoryAssets';
import {
  type CanvasAsset,
  type CanvasAssetBuckets,
  type CanvasAssetKind,
  type CanvasMediaUrlResolver,
  groupCanvasAssetsByDate,
} from '../domain/canvasAsset';
import { useCanvasGenerationHistory } from './useCanvasGenerationHistory';

const TAB_ORDER: CanvasAssetKind[] = ['image', 'video', 'audio', 'model'];
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 25;
const THUMB_BASE_PX = 256;

export interface CanvasHistoryAssetsModalCommandProps {
  projectId: string;
  canvasId: string | null;
  onClose: () => void;
  onUseAsset: (
    asset: CanvasAsset,
    placement?: CanvasHistoryAssetPlacement,
  ) => void;
  onDeleteNode: (nodeId: string) => void;
  imageOnly?: boolean;
  assetSource?: 'generation-history' | 'live-canvas';
}

export interface CanvasHistoryAssetsModalControllerOptions
  extends CanvasHistoryAssetsModalCommandProps {
  historyNodeIds: string[];
  resolveNodeMeta: (nodeId: string) => HistoryNodeMeta;
  liveAssetBuckets: CanvasAssetBuckets;
  resolveMediaUrl: CanvasMediaUrlResolver;
  downloadAsset: (url: string) => Promise<void>;
}

export interface CanvasHistoryWorldViewerRequest {
  projectId: string;
  url: string;
  displayName: string;
}

export function useCanvasHistoryAssetsModalController({
  projectId,
  canvasId,
  onClose,
  onUseAsset,
  onDeleteNode,
  imageOnly = false,
  assetSource = 'generation-history',
  historyNodeIds,
  resolveNodeMeta,
  liveAssetBuckets,
  resolveMediaUrl,
  downloadAsset,
}: CanvasHistoryAssetsModalControllerOptions) {
  const useHistory = assetSource === 'generation-history';
  const { records, isLoading } = useCanvasGenerationHistory(
    { projectId, canvasId },
    historyNodeIds,
    { enabled: useHistory && canvasId !== null },
  );

  const [activeTab, setActiveTab] = useState<CanvasAssetKind>('image');
  const tabOrder = imageOnly ? (['image'] as CanvasAssetKind[]) : TAB_ORDER;
  const [direction, setDirection] = useState<'desc' | 'asc'>('desc');
  const [zoom, setZoom] = useState(100);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [imageViewerIndex, setImageViewerIndex] = useState<number | null>(null);
  const [videoViewerUrl, setVideoViewerUrl] = useState<string | null>(null);
  const [worldViewerRequest, setWorldViewerRequest] =
    useState<CanvasHistoryWorldViewerRequest | null>(null);
  const [promptDialogText, setPromptDialogText] = useState<string | null>(null);

  const buckets = useMemo(
    () =>
      useHistory
        ? recordsToAssetBuckets(records, resolveNodeMeta, resolveMediaUrl)
        : liveAssetBuckets,
    [liveAssetBuckets, records, resolveMediaUrl, resolveNodeMeta, useHistory],
  );
  const activeAssets = buckets[activeTab];
  const groups = useMemo(
    () => groupCanvasAssetsByDate(activeAssets, direction),
    [activeAssets, direction],
  );
  const orderedImageUrls = useMemo(
    () => groups.flatMap((group) => group.assets).map((asset) => asset.url),
    [groups],
  );
  const selectedAssets = useMemo(
    () => activeAssets.filter((asset) => selectedIds.has(asset.id)),
    [activeAssets, selectedIds],
  );
  const allSelected =
    activeAssets.length > 0 && selectedAssets.length === activeAssets.length;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (promptDialogText !== null) {
        setPromptDialogText(null);
      } else if (
        imageViewerIndex === null &&
        !videoViewerUrl &&
        !worldViewerRequest
      ) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    imageViewerIndex,
    onClose,
    promptDialogText,
    videoViewerUrl,
    worldViewerRequest,
  ]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  const selectTab = useCallback((tab: CanvasAssetKind) => {
    setActiveTab(tab);
  }, []);
  const toggleDirection = useCallback(() => {
    setDirection((value) => (value === 'desc' ? 'asc' : 'desc'));
  }, []);
  const zoomOut = useCallback(() => {
    setZoom((value) => Math.max(ZOOM_MIN, value - ZOOM_STEP));
  }, []);
  const zoomIn = useCallback(() => {
    setZoom((value) => Math.min(ZOOM_MAX, value + ZOOM_STEP));
  }, []);
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((value) => !value);
    setSelectedIds(new Set());
  }, []);
  const toggleAssetSelection = useCallback((asset: CanvasAsset) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        next.add(asset.id);
      }
      return next;
    });
  }, []);
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((current) =>
      current.size === activeAssets.length
        ? new Set()
        : new Set(activeAssets.map((asset) => asset.id)),
    );
  }, [activeAssets]);

  const viewAsset = useCallback(
    (asset: CanvasAsset, fallbackWorldName: string) => {
      if (asset.kind === 'image') {
        const index = orderedImageUrls.indexOf(asset.url);
        setImageViewerIndex(index >= 0 ? index : 0);
        return;
      }
      if (asset.kind === 'video') {
        setVideoViewerUrl(asset.url);
        return;
      }
      if (asset.kind !== 'model') return;
      setWorldViewerRequest({
        projectId,
        url: asset.url,
        displayName: asset.label ?? fallbackWorldName,
      });
    },
    [orderedImageUrls, projectId],
  );

  const useAsset = useCallback(
    (asset: CanvasAsset) => {
      onUseAsset(asset);
      onClose();
    },
    [onClose, onUseAsset],
  );
  const deleteAsset = useCallback(
    (asset: CanvasAsset) => onDeleteNode(asset.nodeId),
    [onDeleteNode],
  );

  const downloadSelected = useCallback(async () => {
    if (isDownloading || selectedAssets.length === 0) return;
    setIsDownloading(true);
    try {
      for (const asset of selectedAssets) {
        await downloadAsset(asset.url);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } finally {
      setIsDownloading(false);
    }
  }, [downloadAsset, isDownloading, selectedAssets]);

  const useSelected = useCallback(() => {
    if (selectedAssets.length === 0) return;
    selectedAssets.forEach((asset, index) => {
      onUseAsset(asset, { index, total: selectedAssets.length });
    });
    onClose();
  }, [onClose, onUseAsset, selectedAssets]);

  const navigateImageViewer = useCallback(
    (direction: 'prev' | 'next') => {
      setImageViewerIndex((index) => {
        if (index === null) return index;
        const next = direction === 'next' ? index + 1 : index - 1;
        if (next < 0 || next >= orderedImageUrls.length) return index;
        return next;
      });
    },
    [orderedImageUrls.length],
  );

  return {
    onClose,
    useHistory,
    isLoading,
    tabOrder,
    buckets,
    activeTab,
    selectTab,
    direction,
    toggleDirection,
    zoom,
    zoomOut,
    zoomIn,
    selectionMode,
    selectedIds,
    selectedIdCount: selectedIds.size,
    selectedCount: selectedAssets.length,
    allSelected,
    toggleSelectionMode,
    toggleAssetSelection,
    toggleSelectAll,
    activeAssets,
    groups,
    thumbPx: Math.round((THUMB_BASE_PX * zoom) / 100),
    viewAsset,
    useAsset,
    deleteAsset,
    isDownloading,
    downloadSelected,
    useSelected,
    imageViewerIndex,
    orderedImageUrls,
    closeImageViewer: () => setImageViewerIndex(null),
    navigateImageViewer,
    videoViewerUrl,
    closeVideoViewer: () => setVideoViewerUrl(null),
    worldViewerRequest,
    setWorldViewerOpen: (open: boolean) => {
      if (!open) setWorldViewerRequest(null);
    },
    promptDialogText,
    openPromptDialog: (text: string) => setPromptDialogText(text),
    closePromptDialog: () => setPromptDialogText(null),
  };
}

export type CanvasHistoryAssetsModalController = ReturnType<
  typeof useCanvasHistoryAssetsModalController
>;
