// Copyright (c) 2026 AI anime
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UnifiedVideoPlayer } from "@/components/media/UnifiedVideoPlayer";

import { NodeGenerationOverlay } from "./NodeGenerationOverlay";
import { RegenerateButton } from "./RegenerateButton";

export function VideoUploadingState() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted/85">
      <Loader2 className="h-7 w-7 animate-spin opacity-70" />
      <span className="px-4 text-center text-[12px] leading-6">
        {t("node.videoNode.uploading")}
      </span>
    </div>
  );
}

export interface VideoGenerationHistoryPreviewProps {
  videoUrl: string;
  onClose: () => void;
}

export function VideoGenerationHistoryPreview({
  videoUrl,
  onClose,
}: VideoGenerationHistoryPreviewProps) {
  return (
    <div className="relative h-full w-full">
      <UnifiedVideoPlayer
        src={videoUrl}
        className="h-full w-full object-contain"
        preload="metadata"
        compact
        onClick={(event) => event.stopPropagation()}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2">
        <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-media/60 px-2.5 py-1 text-[11px] text-media-foreground/90 backdrop-blur">
          <Loader2 className="h-3 w-3 animate-spin" />
          新视频生成中…
        </span>
        <button
          type="button"
          className="nodrag pointer-events-auto inline-flex items-center gap-1 rounded-full bg-media/60 px-2.5 py-1 text-[11px] text-media-foreground/90 backdrop-blur transition-colors hover:bg-media/75"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <X className="h-3 w-3" />
          返回
        </button>
      </div>
    </div>
  );
}

export interface VideoGeneratingStateProps {
  previewImageUrl: string | null;
  progress?: number | null;
}

export function VideoGeneratingState({
  previewImageUrl,
  progress = null,
}: VideoGeneratingStateProps) {
  return (
    <div className="relative h-full w-full">
      {previewImageUrl ? (
        <img
          src={previewImageUrl}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
      ) : null}
      <NodeGenerationOverlay
        progress={progress}
      />
    </div>
  );
}

export interface VideoGenerationErrorStateProps {
  error: string;
  requestId: string | null;
  busy: boolean;
  disabled: boolean;
  onRegenerate: () => void;
}

export function VideoGenerationErrorState({
  error,
  requestId,
  busy,
  disabled,
  onRegenerate,
}: VideoGenerationErrorStateProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-destructive">
      <AlertTriangle className="h-7 w-7 opacity-90" />
      <span className="text-center text-[12px] font-medium leading-5 text-destructive">
        视频生成失败
      </span>
      <span className="max-h-[64px] overflow-y-auto break-words text-center text-[11px] leading-5 text-destructive [overflow-wrap:anywhere]">
        {error}
      </span>
      {requestId && (
        <div className="flex w-full max-w-[240px] items-center gap-1 rounded bg-destructive/10 px-2 py-1">
          <span className="shrink-0 text-[10px] text-destructive">请求ID</span>
          <code
            className="min-w-0 flex-1 truncate font-mono text-[10px] text-destructive"
            data-ui-tooltip={requestId}
          >
            {requestId}
          </code>
        </div>
      )}
      <div className="mt-1">
        <RegenerateButton
          onClick={onRegenerate}
          busy={busy}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export function VideoLoadErrorOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-media/80 px-4 text-center text-destructive">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <span className="text-[12px] font-medium">视频加载失败</span>
    </div>
  );
}

export function VideoMetadataLoadingOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg-dark/40">
      <Loader2 className="h-6 w-6 animate-spin text-text-muted/70" />
    </div>
  );
}
