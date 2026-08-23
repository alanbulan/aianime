// Copyright (c) 2026 AI anime
import { createPortal } from 'react-dom';
import {
  Check,
  Loader2,
  Music,
  RefreshCw,
  Trash2,
  Upload,
  Video as VideoIcon,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { withMediaVariant } from '@/lib/media-url';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { assetLibrarySourceLabel } from '../application/assetLibraryModalModel';
import type { AssetLibraryModalController } from './useAssetLibraryModalController';

const ASSET_LIBRARY_MODAL_CLASS =
  'relative flex h-[min(720px,82vh)] w-[min(1120px,92vw)] flex-col overflow-hidden rounded-[10px] border border-border bg-background/96 shadow-2xl backdrop-blur-md';
const ASSET_LIBRARY_CARD_CLASS =
  'overflow-hidden rounded-[12px] border border-border bg-card transition-colors';
const ASSET_LIBRARY_CARD_HOVER_CLASS =
  'hover:border-foreground/25 hover:bg-muted';
const ASSET_LIBRARY_UPLOAD_CARD_CLASS =
  'flex aspect-square flex-col items-center justify-center gap-3 rounded-[12px] border border-dashed border-border bg-card px-4 text-foreground transition-colors hover:border-foreground/25 hover:bg-muted';

export interface AssetLibraryModalViewProps {
  controller: AssetLibraryModalController;
  resolveMediaUrl: (url: string) => string;
}

export function AssetLibraryModalView({
  controller,
  resolveMediaUrl,
}: AssetLibraryModalViewProps) {
  const {
    open,
    project,
    onClose,
    maxSelectable,
    tabs,
    activeTabKey,
    setActiveTabKey,
    activeTab,
    activeMedia,
    fileInputRef,
    isLoadingLibrary,
    libraryError,
    isSyncing,
    deletingId,
    deleteDialog,
    isDragging,
    setIsDragging,
    visibleItems,
    visiblePending,
    totalCount,
    activeSelectedCount,
    hasSelection,
    handleSyncFromMainline,
    removePending,
    handleFiles,
    handleDeleteEntry,
    handleDrop,
    selectionKey,
    isSelected,
    toggleSelect,
    handleConfirm,
  } = controller;

  if (typeof document === 'undefined' || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-scrim backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={ASSET_LIBRARY_MODAL_CLASS}
        onClick={(event) => event.stopPropagation()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        <div className="flex shrink-0 items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">资产库</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSyncFromMainline()}
              disabled={!project || isSyncing}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              data-ui-tooltip="打开时已自动同步；如主线新增了人物 / 场景 / 道具，可点此重新同步"
            >
              {isSyncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              重新同步
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              data-ui-tooltip="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between px-5 pb-4">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTabKey(tab.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab.key === activeTabKey
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted/85">
            <span>
              已录入 <span className="text-foreground">{totalCount}</span> 个
            </span>
            <span className="h-3 w-px bg-border" />
            <span>
              已选{' '}
              <span
                className={
                  activeSelectedCount > 0 ? 'text-primary' : 'text-foreground'
                }
              >
                {activeSelectedCount}
              </span>
              /{maxSelectable}
            </span>
            {isLoadingLibrary && (
              <Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin text-text-muted" />
            )}
          </div>
        </div>

        <div className="ui-scrollbar relative flex-1 overflow-y-auto px-5 pb-2">
          {isDragging && activeTab?.allowUpload && (
            <div className="pointer-events-none absolute inset-x-5 inset-y-0 z-10 flex items-center justify-center rounded-[8px] border border-dashed border-primary/60 bg-primary/10 text-sm text-foreground">
              松开以上传{activeTab.label}
            </div>
          )}
          {libraryError && (
            <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              加载失败：{libraryError}
            </div>
          )}
          <div
            className="grid gap-3.5"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 176px))',
            }}
          >
            {activeTab?.allowUpload && (
              <>
                <div className={ASSET_LIBRARY_UPLOAD_CARD_CLASS}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!project}
                    className="inline-flex h-8 items-center justify-center rounded-md bg-muted px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    本地上传
                  </button>
                  <div className="text-[11px] text-text-muted/75">
                    {activeMedia === 'image'
                      ? '支持 PNG / JPG / WebP，可拖入'
                      : activeMedia === 'video'
                        ? '支持 MP4 / MOV 等，可拖入'
                        : '支持 MP3 / WAV / M4A，可拖入'}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={activeTab.accept}
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) handleFiles(event.target.files);
                    event.target.value = '';
                  }}
                />
              </>
            )}

            {visiblePending.map((pending) => (
              <div
                key={pending.id}
                className={`group relative aspect-square ${ASSET_LIBRARY_CARD_CLASS}`}
              >
                {pending.media === 'image' ? (
                  <img
                    src={pending.previewUrl}
                    alt=""
                    className="h-full w-full object-cover opacity-70"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                    {pending.media === 'video' ? (
                      <VideoIcon className="h-8 w-8" />
                    ) : (
                      <Music className="h-8 w-8" />
                    )}
                  </div>
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-media/45">
                  {pending.status === 'uploading' ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-media-foreground" />
                      <div className="text-[11px] text-media-foreground/90">
                        上传中…
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[11px] text-destructive">
                        上传失败
                      </div>
                      {pending.error && (
                        <div className="line-clamp-2 px-2 text-center text-[10px] text-destructive">
                          {pending.error}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {pending.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => removePending(pending.id)}
                    className="absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-media/55 text-media-foreground transition-colors hover:bg-media/75"
                    data-ui-tooltip="移除"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            {visibleItems.map((entry, index) => {
              const isDeleting = deletingId != null && entry.id === deletingId;
              const key = selectionKey(entry);
              const selected = isSelected(key);
              const disabledSelect =
                !selected && activeSelectedCount >= maxSelectable;
              return (
                <div
                  key={entry.id ?? `idx-${index}`}
                  className={`group relative aspect-square ${ASSET_LIBRARY_CARD_CLASS} ${
                    selected
                      ? 'border-primary/70 ring-1 ring-primary/45'
                      : ASSET_LIBRARY_CARD_HOVER_CLASS
                  } cursor-pointer`}
                  onClick={() => {
                    if (disabledSelect) return;
                    toggleSelect(key);
                  }}
                >
                  {entry.media === 'image' ? (
                    <img
                      src={withMediaVariant(
                        resolveMediaUrl(entry.url),
                        'thumb2x',
                      )}
                      alt={entry.name}
                      className="h-full w-full object-cover"
                      loading={index < 12 ? 'eager' : 'lazy'}
                      decoding="async"
                      draggable={false}
                    />
                  ) : entry.media === 'video' ? (
                    <video
                      src={resolveMediaUrl(entry.url)}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
                      <Music className="h-9 w-9" />
                      <audio
                        src={resolveMediaUrl(entry.url)}
                        controls
                        className="w-[86%]"
                        onClick={(event) => event.stopPropagation()}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (disabledSelect) return;
                      toggleSelect(key);
                    }}
                    disabled={disabledSelect}
                    data-ui-tooltip={
                      disabledSelect
                        ? `最多可选 ${maxSelectable} 个`
                        : selected
                          ? '取消选择'
                          : '选择'
                    }
                    className={`absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-media-foreground/70 bg-media/35 text-transparent hover:border-media-foreground'
                    } ${disabledSelect ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </button>

                  {entry.source !== 'upload' && (
                    <span className="pointer-events-none absolute right-2 top-2 rounded bg-media/55 px-1.5 py-0.5 text-[10px] text-media-foreground/90">
                      {assetLibrarySourceLabel(entry.source)}
                    </span>
                  )}

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-media/80 to-transparent px-3 py-2 text-xs text-media-foreground">
                    <div className="truncate">{entry.name || '(未命名)'}</div>
                  </div>
                  {entry.source === 'upload' && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteEntry(entry);
                      }}
                      disabled={!entry.id || isDeleting}
                      className="absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-media/60 text-media-foreground opacity-0 transition-[opacity,background-color] hover:bg-media/80 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                      data-ui-tooltip={entry.id ? '删除' : '该条目缺少 id，无法删除'}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {!isLoadingLibrary &&
            visibleItems.length === 0 &&
            visiblePending.length === 0 &&
            !libraryError && (
              <div className="mt-3 text-center text-[11px] text-text-muted/70">
                {activeTab?.allowUpload
                  ? '该类目暂无素材，可点击「本地上传」添加；主线资产已自动同步，也可点右上角「重新同步」。'
                  : '主线暂无场景，或已自动同步为空；可点右上角「重新同步」重试。'}
              </div>
            )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 px-5 pb-3 pt-2">
          <Button
            size="sm"
            className="bg-foreground px-4 text-background hover:bg-foreground/90"
            disabled={!hasSelection}
            onClick={handleConfirm}
          >
            确定
          </Button>
        </div>
        <AlertDialog open={deleteDialog.open} onOpenChange={deleteDialog.onOpenChange}>
          <AlertDialogContent
            size="sm"
            overlayClassName="z-[310]"
            className="z-[320]"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>删除素材</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除「{deleteDialog.name}」？删除后无法恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(deletingId)}>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={Boolean(deletingId)}
                onClick={() => void deleteDialog.confirm()}
              >
                {deletingId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>,
    document.body,
  );
}
