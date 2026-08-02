// Copyright (c) 2026 AI anime
import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronDown,
  Copy,
  Download,
  Film,
  Gauge,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Magnet,
  Maximize,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Split,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import type {
  CanvasVideoComposeResolution,
  ComposeTimelineState,
  VideoComposeClipReference,
} from "@/modules/creative_canvas/public";

import {
  VideoComposeTrackRow,
  type VideoComposeTrackRowProps,
} from "./VideoComposeTrackRow";
import {
  VideoComposeSpeedPopover,
  VideoComposeToolButton,
  VideoComposeToolDivider,
  VideoComposeVolumePopover,
  VideoComposeZoomInGlyph,
  VideoComposeZoomOutGlyph,
} from "./VideoComposeTimelineControls";

const RULER_MIN_SECONDS = 10;

export type VideoComposeExportLocation = "local" | "canvas";

export interface VideoComposeExportDialogState {
  open: boolean;
  location: VideoComposeExportLocation;
  resolution: CanvasVideoComposeResolution;
}

export interface VideoComposeModalViewProps {
  timeline: ComposeTimelineState;
  header: {
    coverDisplayUrl: string | null;
    canSetCover: boolean;
    onOpenCoverEditor: () => void;
    onClose: () => void;
  };
  exportPanel: {
    canExport: boolean;
    isExporting: boolean;
    error: string | null;
    menuOpen: boolean;
    dialog: VideoComposeExportDialogState;
    onMenuOpenChange: (open: boolean) => void;
    onOpenDialog: (location: VideoComposeExportLocation) => void;
    onDialogLocationChange: (location: VideoComposeExportLocation) => void;
    onDialogResolutionChange: (
      resolution: CanvasVideoComposeResolution,
    ) => void;
    onCloseDialog: () => void;
    onConfirmDialog: () => void;
  };
  preview: {
    videoRef: RefObject<HTMLVideoElement | null>;
    audioRef: RefObject<HTMLAudioElement | null>;
    stageRef: RefObject<HTMLDivElement | null>;
    videoSource: string | null;
  };
  toolbar: {
    canUndo: boolean;
    canRedo: boolean;
    hasSelectedClip: boolean;
    canSplitInside: boolean;
    speedOpen: boolean;
    selectedSpeed: number;
    selectedSourceSpanMs: number;
    volumeOpen: boolean;
    selectedVolume: number;
    selectedMuted: boolean;
    playheadMs: number;
    durationMs: number;
    isPlaying: boolean;
    snapEnabled: boolean;
    pxPerSec: number;
    minPxPerSec: number;
    maxPxPerSec: number;
    onUndo: () => void;
    onRedo: () => void;
    onSplit: () => void;
    onTrimToPlayhead: (side: "left" | "right") => void;
    onSpeedOpenChange: (open: boolean) => void;
    onSpeedChange: (speed: number) => void;
    onVolumeOpenChange: (open: boolean) => void;
    onVolumeChange: (volume: number) => void;
    onVolumeGestureStart: () => void;
    onToggleMute: () => void;
    onDuplicate: () => void;
    onRemoveSelected: () => void;
    onTogglePlayback: () => void;
    onResetToUpstream: () => void;
    onSnapEnabledChange: (enabled: boolean) => void;
    onZoomChange: (pxPerSec: number) => void;
    onZoomOut: () => void;
    onZoomIn: () => void;
    onFullscreenPlay: () => void;
  };
  timelineSurface: {
    pxPerSec: number;
    pxPerMs: number;
    durationMs: number;
    selected: VideoComposeClipReference | null;
    selectedIds: ReadonlySet<string>;
    overlapClipIds: ReadonlySet<string>;
    dragGhost: {
      clipId: string;
      trackId: string;
      ghostLeftPx: number;
    } | null;
    trimEdit: {
      clipId: string;
      edge: "start" | "end";
    } | null;
    trackScrollRef: RefObject<HTMLDivElement | null>;
    playheadElRef: RefObject<HTMLDivElement | null>;
    onStartScrub: (event: ReactPointerEvent) => void;
    onClearSelection: () => void;
    onStartClipMove: VideoComposeTrackRowProps["onStartClipMove"];
    onTrim: VideoComposeTrackRowProps["onTrim"];
    onMoveToNewTrack: VideoComposeTrackRowProps["onMoveToNewTrack"];
    onRemoveClip: VideoComposeTrackRowProps["onRemove"];
    onSetClipMuted: (
      trackId: string,
      clipId: string,
      muted: boolean,
    ) => void;
  };
  coverEditor: ReactNode;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function VideoComposeModalView({
  timeline,
  header,
  exportPanel,
  preview,
  toolbar,
  timelineSurface,
  coverEditor,
}: VideoComposeModalViewProps) {
  const { t } = useTranslation();
  const rulerSeconds = Math.max(
    RULER_MIN_SECONDS,
    Math.ceil(timelineSurface.durationMs / 1000),
  );
  const timelineWidthPx = rulerSeconds * timelineSurface.pxPerSec;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border-dark px-5 py-3">
        <div className="flex items-center gap-2 text-text-dark">
          <Film className="h-5 w-5 text-text-muted" />
          <span className="text-sm font-semibold">{t("videoCompose.title")}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={header.onOpenCoverEditor}
            disabled={!header.canSetCover}
            className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-foreground transition-colors hover:border-foreground/25 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {header.coverDisplayUrl ? (
              <img
                src={header.coverDisplayUrl}
                alt=""
                className="h-5 w-[34px] rounded-[4px] object-cover"
              />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            {t("videoCompose.cover.button")}
          </button>

          <div
            className="relative"
            onMouseEnter={() => {
              if (exportPanel.canExport && !exportPanel.dialog.open) {
                exportPanel.onMenuOpenChange(true);
              }
            }}
            onMouseLeave={() => exportPanel.onMenuOpenChange(false)}
          >
            <button
              type="button"
              disabled={!exportPanel.canExport}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportPanel.isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Film className="h-4 w-4" />
              )}
              {exportPanel.isExporting
                ? t("videoCompose.exporting")
                : t("videoCompose.export")}
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </button>
            {exportPanel.menuOpen &&
              exportPanel.canExport &&
              !exportPanel.dialog.open && (
                <div className="absolute right-0 top-full z-30 pt-2">
                  <div className="min-w-[180px] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-2xl">
                    <div className="px-2 py-1 text-xs text-text-muted">
                      {t("videoCompose.exportLocation")}
                    </div>
                    <button
                      type="button"
                      onClick={() => exportPanel.onOpenDialog("local")}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      <Download className="h-4 w-4" />
                      {t("videoCompose.exportToLocal")}
                    </button>
                    <button
                      type="button"
                      onClick={() => exportPanel.onOpenDialog("canvas")}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      <LayoutGrid className="h-4 w-4" />
                      {t("videoCompose.exportToCanvas")}
                    </button>
                  </div>
                </div>
              )}
            {exportPanel.dialog.open && (
              <>
                <div
                  className="fixed inset-0 z-[135]"
                  onClick={() => {
                    if (!exportPanel.isExporting) exportPanel.onCloseDialog();
                  }}
                />
                <div className="absolute right-0 top-full z-[140] mt-2 w-[360px] rounded-xl border border-border bg-popover p-5 text-left text-popover-foreground shadow-2xl">
                  <h3 className="mb-4 text-sm font-semibold text-text-dark">
                    {t("videoCompose.exportDialog.title")}
                  </h3>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-xs text-text-muted">
                        {t("videoCompose.exportDialog.location")}
                      </span>
                      <select
                        value={exportPanel.dialog.location}
                        onChange={(event) =>
                          exportPanel.onDialogLocationChange(
                            event.target.value as VideoComposeExportLocation,
                          )
                        }
                        className="min-w-[160px] rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/45"
                      >
                        <option value="local">
                          {t("videoCompose.exportToLocal")}
                        </option>
                        <option value="canvas">
                          {t("videoCompose.exportToCanvas")}
                        </option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-xs text-text-muted">
                        {t("videoCompose.exportDialog.resolution")}
                      </span>
                      <select
                        value={exportPanel.dialog.resolution}
                        onChange={(event) =>
                          exportPanel.onDialogResolutionChange(
                            event.target.value as CanvasVideoComposeResolution,
                          )
                        }
                        className="min-w-[160px] rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/45"
                      >
                        <option value="720p">720P</option>
                        <option value="1080p">1080P</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-xs text-text-muted">
                        {t("videoCompose.exportDialog.format")}
                      </span>
                      <select
                        value="mp4"
                        disabled
                        className="min-w-[160px] cursor-not-allowed rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground opacity-70 outline-none"
                      >
                        <option value="mp4">MP4</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={exportPanel.isExporting}
                      onClick={exportPanel.onCloseDialog}
                      className="rounded-md border border-border bg-muted px-4 py-1.5 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={exportPanel.isExporting}
                      onClick={exportPanel.onConfirmDialog}
                      className="rounded-md bg-primary px-5 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {t("common.confirm")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={header.onClose}
            disabled={exportPanel.isExporting}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {exportPanel.error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-destructive">
          {t("videoCompose.error.prefix")}: {exportPanel.error}
        </div>
      )}

      <div
        ref={preview.stageRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-media/60 p-4"
      >
        <video
          ref={preview.videoRef}
          className="max-h-full max-w-full rounded-lg bg-media"
          playsInline
          style={{ display: preview.videoSource ? "block" : "none" }}
        />
        {!preview.videoSource && (
          <div className="text-sm text-media-foreground/70">
            {t("videoCompose.emptyPreview")}
          </div>
        )}
        <audio ref={preview.audioRef} className="hidden" />
      </div>

      <div className="relative flex items-center justify-between gap-4 border-t border-border-dark px-4 py-2">
        <div className="flex items-center gap-0.5">
          <VideoComposeToolButton
            icon={Undo2}
            label={t("videoCompose.undo")}
            disabled={!toolbar.canUndo}
            onClick={toolbar.onUndo}
          />
          <VideoComposeToolButton
            icon={Redo2}
            label={t("videoCompose.redo")}
            disabled={!toolbar.canRedo}
            onClick={toolbar.onRedo}
          />
          <VideoComposeToolDivider />
          <VideoComposeToolButton
            icon={Split}
            label={t("videoCompose.split")}
            disabled={!toolbar.canSplitInside}
            onClick={toolbar.onSplit}
          />
          <VideoComposeToolButton
            icon={ArrowLeftToLine}
            label={t("videoCompose.splitLeft")}
            disabled={!toolbar.canSplitInside}
            onClick={() => toolbar.onTrimToPlayhead("left")}
          />
          <VideoComposeToolButton
            icon={ArrowRightToLine}
            label={t("videoCompose.splitRight")}
            disabled={!toolbar.canSplitInside}
            onClick={() => toolbar.onTrimToPlayhead("right")}
          />
          <div className="relative">
            <VideoComposeToolButton
              icon={Gauge}
              label={t("videoCompose.speed")}
              disabled={!toolbar.hasSelectedClip}
              active={toolbar.speedOpen}
              onClick={() =>
                toolbar.onSpeedOpenChange(!toolbar.speedOpen)
              }
            />
            {toolbar.speedOpen && toolbar.hasSelectedClip && (
              <VideoComposeSpeedPopover
                speed={toolbar.selectedSpeed}
                sourceSpanMs={toolbar.selectedSourceSpanMs}
                onChange={toolbar.onSpeedChange}
                onClose={() => toolbar.onSpeedOpenChange(false)}
              />
            )}
          </div>
          <div className="relative">
            <VideoComposeToolButton
              icon={
                toolbar.selectedMuted || toolbar.selectedVolume <= 0
                  ? VolumeX
                  : Volume2
              }
              label={t("videoCompose.volume")}
              disabled={!toolbar.hasSelectedClip}
              active={toolbar.volumeOpen}
              onClick={() =>
                toolbar.onVolumeOpenChange(!toolbar.volumeOpen)
              }
            />
            {toolbar.volumeOpen && toolbar.hasSelectedClip && (
              <VideoComposeVolumePopover
                volume={toolbar.selectedVolume}
                muted={toolbar.selectedMuted}
                onChange={toolbar.onVolumeChange}
                onGestureStart={toolbar.onVolumeGestureStart}
                onToggleMute={toolbar.onToggleMute}
                onClose={() => toolbar.onVolumeOpenChange(false)}
              />
            )}
          </div>
          <VideoComposeToolButton
            icon={Copy}
            label={t("videoCompose.duplicate")}
            disabled={!toolbar.hasSelectedClip}
            onClick={toolbar.onDuplicate}
          />
          <VideoComposeToolButton
            icon={Trash2}
            label={t("videoCompose.removeClip")}
            disabled={!toolbar.hasSelectedClip}
            onClick={toolbar.onRemoveSelected}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {formatTime(toolbar.playheadMs)}
          </span>
          <button
            type="button"
            onClick={toolbar.onTogglePlayback}
            disabled={toolbar.durationMs <= 0}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-accent disabled:opacity-40"
            aria-label={
              toolbar.isPlaying
                ? t("videoCompose.pause")
                : t("videoCompose.play")
            }
          >
            {toolbar.isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {formatTime(toolbar.durationMs)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <VideoComposeToolButton
            icon={RotateCcw}
            label={t("videoCompose.resetToUpstream")}
            onClick={toolbar.onResetToUpstream}
          />
          <VideoComposeToolDivider />
          <VideoComposeToolButton
            icon={Magnet}
            label={t("videoCompose.snap")}
            active={toolbar.snapEnabled}
            onClick={() =>
              toolbar.onSnapEnabledChange(!toolbar.snapEnabled)
            }
          />
          <VideoComposeToolDivider />
          <VideoComposeToolButton
            icon={VideoComposeZoomOutGlyph}
            label={t("videoCompose.zoomOut")}
            disabled={toolbar.pxPerSec <= toolbar.minPxPerSec}
            onClick={toolbar.onZoomOut}
          />
          <input
            type="range"
            min={toolbar.minPxPerSec}
            max={toolbar.maxPxPerSec}
            step={1}
            value={toolbar.pxPerSec}
            onChange={(event) =>
              toolbar.onZoomChange(Number(event.target.value))
            }
            className="h-1 w-24 cursor-pointer accent-primary"
            aria-label={t("videoCompose.zoom")}
          />
          <VideoComposeToolButton
            icon={VideoComposeZoomInGlyph}
            label={t("videoCompose.zoomIn")}
            disabled={toolbar.pxPerSec >= toolbar.maxPxPerSec}
            onClick={toolbar.onZoomIn}
          />
          <VideoComposeToolDivider />
          <VideoComposeToolButton
            icon={Maximize}
            label={t("videoCompose.fullscreenPlay")}
            disabled={toolbar.durationMs <= 0}
            onClick={toolbar.onFullscreenPlay}
          />
        </div>
      </div>

      <div className="h-[260px] shrink-0 overflow-hidden border-t border-border bg-card">
        <div
          ref={timelineSurface.trackScrollRef}
          className="ui-scrollbar-vertical h-full overflow-auto"
        >
          <div
            className="relative min-h-full"
            style={{ width: timelineWidthPx, minWidth: "100%" }}
          >
            <div
              className="relative h-7 cursor-pointer select-none border-b border-border-dark"
              onPointerDown={timelineSurface.onStartScrub}
            >
              {Array.from({ length: rulerSeconds + 1 }, (_, second) => (
                <div
                  key={second}
                  className="absolute top-0 flex h-full flex-col justify-center"
                  style={{ left: second * timelineSurface.pxPerSec }}
                >
                  <div className="h-2 w-px bg-border-dark" />
                  <span className="ml-1 text-[10px] tabular-nums text-text-muted">
                    {formatTime(second * 1000)}
                  </span>
                </div>
              ))}
            </div>

            <div
              className="space-y-2 p-2"
              onPointerDown={timelineSurface.onClearSelection}
            >
              {timeline.tracks.map((track) => (
                <VideoComposeTrackRow
                  key={track.id}
                  track={track}
                  pxPerMs={timelineSurface.pxPerMs}
                  selectedClipId={timelineSurface.selected?.clipId ?? null}
                  selectedIds={timelineSurface.selectedIds}
                  overlapClipIds={timelineSurface.overlapClipIds}
                  draggingClipId={timelineSurface.dragGhost?.clipId ?? null}
                  ghostLeftPx={
                    timelineSurface.dragGhost?.trackId === track.id
                      ? timelineSurface.dragGhost.ghostLeftPx
                      : null
                  }
                  trimmingClipId={timelineSurface.trimEdit?.clipId ?? null}
                  trimEdge={timelineSurface.trimEdit?.edge ?? null}
                  onStartClipMove={timelineSurface.onStartClipMove}
                  onTrim={timelineSurface.onTrim}
                  onMoveToNewTrack={timelineSurface.onMoveToNewTrack}
                  onRemove={timelineSurface.onRemoveClip}
                  onToggleMute={(clipId, muted) =>
                    timelineSurface.onSetClipMuted(track.id, clipId, muted)
                  }
                />
              ))}
            </div>

            <div
              ref={timelineSurface.playheadElRef}
              className="pointer-events-none absolute bottom-0 left-0 top-0 z-20"
              // 播放期间由 controller 直接写 transform，避免 React 重渲染把播放头拉回旧位置。
              style={{ willChange: "transform" }}
            >
              <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-primary" />
              <div
                className="pointer-events-auto absolute inset-y-0 -left-[5px] w-[11px] cursor-ew-resize"
                onPointerDown={timelineSurface.onStartScrub}
              />
              <div
                className="pointer-events-auto absolute -left-[5px] -top-1 h-3 w-3 cursor-ew-resize rounded-full bg-primary shadow"
                onPointerDown={timelineSurface.onStartScrub}
              />
            </div>
          </div>
        </div>
      </div>

      {coverEditor}
    </div>,
    document.body,
  );
}
