// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CanvasHistoryAssetPlacement } from '@/features/canvas/application/canvasHistoryAssetSpawn';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  extractCanvasAssets,
  groupAssetsByDate,
} from '@/features/canvas/domain/canvasAssets';
import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';
import {
  recordsToAssetBuckets,
  useCanvasGenerationHistory,
  type CanvasAsset,
  type CanvasAssetKind,
  type HistoryNodeMeta,
} from '@/modules/creative_canvas/public';
import {
  buildStandaloneWorldManifest,
  type DirectorStageManifest,
} from '@/features/viewer-kit/three-d/directorManifest';
import { downloadUrlAsFile } from '@/lib/browserDownload';
import { resolveMediaUrl } from '@/lib/media-url';

const GENERATIVE_HISTORY_NODE_TYPES = new Set<string>([
  CANVAS_NODE_TYPES.imageGen,
  CANVAS_NODE_TYPES.imageEdit,
  CANVAS_NODE_TYPES.exportImage,
  CANVAS_NODE_TYPES.storyboardSplit,
  CANVAS_NODE_TYPES.storyboardGen,
  CANVAS_NODE_TYPES.video,
  CANVAS_NODE_TYPES.videoStory,
  CANVAS_NODE_TYPES.videoCompose,
  CANVAS_NODE_TYPES.audio,
  CANVAS_NODE_TYPES.script,
  CANVAS_NODE_TYPES.threeDWorld,
]);

const TAB_ORDER: CanvasAssetKind[] = ['image', 'video', 'audio', 'model'];
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 25;
const THUMB_BASE_PX = 256;

export interface CanvasHistoryAssetsModalControllerOptions {
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

export function useCanvasHistoryAssetsModalController({
  projectId,
  canvasId,
  onClose,
  onUseAsset,
  onDeleteNode,
  imageOnly = false,
  assetSource = 'generation-history',
}: CanvasHistoryAssetsModalControllerOptions) {
  const nodes = useCanvasStore((state) => state.nodes);
  const useHistory = assetSource === 'generation-history';
  const fallbackNodeIds = useMemo(
    () =>
      nodes
        .filter((node) => GENERATIVE_HISTORY_NODE_TYPES.has(node.type))
        .map((node) => node.id),
    [nodes],
  );
  const { records, isLoading } = useCanvasGenerationHistory(
    { projectId, canvasId },
    fallbackNodeIds,
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
  const [worldManifest, setWorldManifest] =
    useState<DirectorStageManifest | null>(null);
  const [promptDialogText, setPromptDialogText] = useState<string | null>(null);

  const resolveNodeMeta = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const trimmed = (value: unknown): string | null =>
      typeof value === 'string' && value.trim().length > 0 ? value : null;
    return (nodeId: string): HistoryNodeMeta => {
      const node = byId.get(nodeId);
      if (!node) return { cover: null, name: null };
      const data = node.data as Record<string, unknown>;
      const cover = trimmed(data.previewImageUrl);
      const sourceNodeId = trimmed(data.sourceNodeId);
      const sourceData = (sourceNodeId
        ? byId.get(sourceNodeId)?.data
        : undefined) as Record<string, unknown> | undefined;
      const name =
        trimmed(sourceData?.displayName) ??
        trimmed(sourceData?.sourceFileName) ??
        trimmed(data.displayName);
      return { cover, name };
    };
  }, [nodes]);

  const buckets = useMemo(
    () =>
      useHistory
        ? recordsToAssetBuckets(records, resolveNodeMeta, resolveMediaUrl)
        : extractCanvasAssets(nodes, resolveMediaUrl),
    [nodes, records, resolveNodeMeta, useHistory],
  );
  const activeAssets = buckets[activeTab];
  const groups = useMemo(
    () => groupAssetsByDate(activeAssets, direction),
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
        !worldManifest
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
    worldManifest,
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
      const manifest = buildStandaloneWorldManifest({
        project: projectId,
        url: asset.url,
        displayName: asset.label ?? fallbackWorldName,
      });
      if (manifest) setWorldManifest(manifest);
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
        await downloadUrlAsFile(asset.url);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, selectedAssets]);

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
    worldManifest,
    setWorldViewerOpen: (open: boolean) => {
      if (!open) setWorldManifest(null);
    },
    promptDialogText,
    openPromptDialog: (text: string) => setPromptDialogText(text),
    closePromptDialog: () => setPromptDialogText(null),
  };
}

export type CanvasHistoryAssetsModalController = ReturnType<
  typeof useCanvasHistoryAssetsModalController
>;
