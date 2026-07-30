// Copyright (c) 2026 AI anime
import { useTranslation } from 'react-i18next';
import {
  ArrowDownUp,
  Check,
  Download,
  Loader2,
  Minus,
  Plus,
  X,
} from 'lucide-react';

import type { CanvasAssetKind } from '@/features/canvas/domain/canvasAssets';
import type { CanvasHistoryAssetsModalController } from '@/features/canvas/hooks/useCanvasHistoryAssetsModalController';
import { ThreeDDirectorDialog } from '@/features/viewer-kit/three-d/ThreeDDirectorDialog';

import { CanvasHistoryAssetCard } from './CanvasHistoryAssetCard';
import { ImageViewerModal } from './ImageViewerModal';
import { VideoViewerModal } from './VideoViewerModal';

const TAB_LABEL_KEY: Record<CanvasAssetKind, string> = {
  image: 'canvas.history.tabs.image',
  video: 'canvas.history.tabs.video',
  audio: 'canvas.history.tabs.audio',
  model: 'canvas.history.tabs.world',
};

export interface CanvasHistoryAssetsModalViewProps {
  controller: CanvasHistoryAssetsModalController;
}

export function CanvasHistoryAssetsModalView({
  controller,
}: CanvasHistoryAssetsModalViewProps) {
  const { t } = useTranslation();
  const {
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
    selectedIdCount,
    selectedCount,
    allSelected,
    toggleSelectionMode,
    toggleAssetSelection,
    toggleSelectAll,
    activeAssets,
    groups,
    thumbPx,
    viewAsset,
    useAsset,
    deleteAsset,
    isDownloading,
    downloadSelected,
    useSelected,
    imageViewerIndex,
    orderedImageUrls,
    closeImageViewer,
    navigateImageViewer,
    videoViewerUrl,
    closeVideoViewer,
    worldManifest,
    setWorldViewerOpen,
    promptDialogText,
    openPromptDialog,
    closePromptDialog,
  } = controller;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-scrim backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 flex h-[88vh] w-[92vw] max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between gap-4 px-6 py-4">
          <h2 className="text-[20px] font-semibold leading-none text-foreground">
            {t('canvas.history.title')}
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-full border border-border bg-muted px-1 py-0.5">
              <button
                type="button"
                aria-label={t('canvas.toolbar.zoomOut')}
                onClick={zoomOut}
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[44px] text-center text-[12px] tabular-nums text-foreground/85">
                {zoom}%
              </span>
              <button
                type="button"
                aria-label={t('canvas.toolbar.zoomIn')}
                onClick={zoomIn}
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 px-6 pb-3">
          <div className="flex items-center gap-5">
            {tabOrder.map((tab) => {
              const active = tab === activeTab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => selectTab(tab)}
                  className={`text-[14px] font-medium leading-none transition-colors ${
                    active
                      ? 'text-foreground'
                      : 'text-muted-foreground/70 hover:text-foreground/75'
                  }`}
                >
                  {t(TAB_LABEL_KEY[tab])}({buckets[tab].length})
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleDirection}
              className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {t(
                direction === 'desc'
                  ? 'canvas.history.sortDesc'
                  : 'canvas.history.sortAsc',
              )}
            </button>
            {selectionMode && activeAssets.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {t(
                  allSelected
                    ? 'canvas.history.deselectAll'
                    : 'canvas.history.selectAll',
                )}
              </button>
            )}
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={`flex items-center gap-1.5 text-[13px] transition-colors ${
                selectionMode
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Check className="h-3.5 w-3.5" />
              {selectionMode
                ? t('canvas.history.selectedCount', { n: selectedIdCount })
                : t('canvas.history.batch')}
            </button>
          </div>
        </div>

        <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-8">
          {useHistory && isLoading && activeAssets.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[14px] text-muted-foreground">
              {t('common.loading')}
            </div>
          ) : activeAssets.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[14px] text-muted-foreground">
              {t('canvas.history.empty')}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.date ?? 'undated'} className="mb-7">
                <div className="mb-3 text-[13px] text-muted-foreground">
                  {group.date ?? t('canvas.history.unknownDate')}
                </div>
                <div className="flex flex-wrap items-start gap-3">
                  {group.assets.map((asset) => (
                    <CanvasHistoryAssetCard
                      key={asset.id}
                      asset={asset}
                      sizePx={thumbPx}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(asset.id)}
                      onToggleSelect={() => toggleAssetSelection(asset)}
                      onView={() =>
                        viewAsset(asset, t('viewer.threeD.directorWorld'))
                      }
                      onUse={() => useAsset(asset)}
                      onDelete={() => deleteAsset(asset)}
                      onOpenPrompt={
                        asset.label
                          ? () => openPromptDialog(asset.label!)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {selectionMode && selectedCount > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-5">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-popover/95 px-2.5 py-2 shadow-2xl backdrop-blur">
              <span className="px-2 text-[13px] text-popover-foreground/75">
                {t('canvas.history.selectedCount', { n: selectedCount })}
              </span>
              <span className="h-4 w-px bg-border" aria-hidden />
              <button
                type="button"
                onClick={downloadSelected}
                disabled={isDownloading}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-popover-foreground/85 transition-colors hover:bg-muted hover:text-popover-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {t(
                  isDownloading
                    ? 'canvas.history.downloading'
                    : 'canvas.history.batchDownload',
                )}
              </button>
              <button
                type="button"
                onClick={useSelected}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-popover-foreground/85 transition-colors hover:bg-muted hover:text-popover-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('canvas.history.batchUse')}
              </button>
            </div>
          </div>
        )}
      </div>

      <ImageViewerModal
        open={imageViewerIndex !== null}
        imageUrl={
          imageViewerIndex !== null
            ? (orderedImageUrls[imageViewerIndex] ?? '')
            : ''
        }
        imageList={orderedImageUrls}
        currentIndex={imageViewerIndex ?? 0}
        onClose={closeImageViewer}
        onNavigate={navigateImageViewer}
      />
      <VideoViewerModal
        open={Boolean(videoViewerUrl)}
        videoUrl={videoViewerUrl ?? ''}
        onClose={closeVideoViewer}
      />
      <ThreeDDirectorDialog
        open={Boolean(worldManifest)}
        onOpenChange={setWorldViewerOpen}
        manifest={worldManifest}
        title={t('viewer.threeD.directorWorld')}
        viewerPurpose="freezone"
      />

      {promptDialogText !== null && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-scrim backdrop-blur-sm"
            onClick={closePromptDialog}
            aria-hidden
          />
          <div className="relative z-10 flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5">
              <h3 className="text-[15px] font-semibold text-popover-foreground">
                {t('canvas.history.promptTitle')}
              </h3>
              <button
                type="button"
                onClick={closePromptDialog}
                aria-label={t('common.close')}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="ui-scrollbar overflow-y-auto whitespace-pre-wrap px-5 py-4 text-[13px] leading-relaxed text-popover-foreground/85">
              {promptDialogText}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
