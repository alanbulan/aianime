// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { resolveImageDisplayUrl } from "@/features/canvas/application/imageData";
import type { CanvasNode } from "@/features/canvas/domain/canvasNodes";
import {
  hasExportableClips,
  overlappingVideoClipIds,
  useVideoComposeKeyboardController,
  useVideoComposeTimelineEditorController,
  useVideoComposeTimelinePointerController,
  type ComposeCover,
  type ComposeTimelineState,
} from "@/modules/creative_canvas/public";
import { useVideoComposeExportController } from "@/features/canvas/hooks/useVideoComposeExportController";
import { useVideoComposePlaybackController } from "@/features/canvas/hooks/useVideoComposePlaybackController";
import { useVideoComposeTimelineSessionController } from "@/features/canvas/hooks/useVideoComposeTimelineSessionController";
import {
  VideoComposeModalView,
  type VideoComposeExportDialogState,
  type VideoComposeExportLocation,
} from "@/features/canvas/ui/VideoComposeModalView";
import { useViewerImmersiveBody } from "@/features/viewer-kit/useViewerImmersiveBody";

import { CoverEditor } from "./CoverEditor";

export interface VideoComposeModalProps {
  project: string;
  canvasId: string;
  /** 画布上被选中、用于初始化时间线的节点 id（按选择顺序）。 */
  seedNodeIds: string[];
  /** 当前连接的上游节点快照，用于初始化时间线并校正已有草稿。 */
  sourceNodes: CanvasNode[];
  onClose: () => void;
  /** 合成成功后回调，参数为最终视频 url + 封面 url（未设封面时为 null）。 */
  onComposed: (url: string, coverUrl: string | null) => void;
  /** 上次保存的草稿时间线；提供时优先用它初始化（而非从上游重新摆放）。 */
  initialTimeline?: ComposeTimelineState | null;
  /** 关闭弹窗时回传当前时间线，供宿主持久化为草稿。 */
  onPersistDraft?: (timeline: ComposeTimelineState) => void;
}

const DEFAULT_PX_PER_SEC = 80;
const MIN_PX_PER_SEC = 20;
const MAX_PX_PER_SEC = 240;
const ZOOM_STEP = 1.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function makeClipId(): string {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTrackId(): string {
  return `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function VideoComposeModal({
  project,
  canvasId,
  seedNodeIds,
  sourceNodes,
  onClose,
  onComposed,
  initialTimeline,
  onPersistDraft,
}: VideoComposeModalProps) {
  const { t } = useTranslation();
  // 弹窗内快捷键接管期间，让画布全局删除、复制和撤销快捷键整体让位。
  useViewerImmersiveBody(true);

  const {
    timeline,
    timelineRef,
    selected,
    selectedIds,
    canUndo,
    canRedo,
    selectOnly,
    clearSelection,
    toggleInSelection,
    removeFromSelection,
    pushHistory,
    undo,
    redo,
    applyTimelineEdit,
    applyCover: applyTimelineCover,
    resetToUpstream,
    updateTimelineTracks,
  } = useVideoComposeTimelineSessionController({
    initialTimeline,
    sourceNodes,
    seedNodeIds,
    createClipId: makeClipId,
    onPersistDraft,
  });
  const { isExporting, exportError, runExport } =
    useVideoComposeExportController({
      project,
      canvasId,
      timeline,
      onComposed,
      overlapErrorMessage: t("videoCompose.error.overlap"),
      missingUrlErrorMessage: t("videoCompose.error.noUrl"),
    });

  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportDialog, setExportDialog] =
    useState<VideoComposeExportDialogState>({
      open: false,
      location: "local",
      resolution: "1080p",
    });
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);

  const applyCover = useCallback(
    (cover: ComposeCover) => {
      applyTimelineCover(cover);
      setCoverEditorOpen(false);
    },
    [applyTimelineCover],
  );
  const openExportDialog = useCallback(
    (location: VideoComposeExportLocation) => {
      setExportMenuOpen(false);
      setExportDialog({ open: true, location, resolution: "1080p" });
    },
    [],
  );
  const setExportLocation = useCallback(
    (location: VideoComposeExportLocation) => {
      setExportDialog((current) => ({ ...current, location }));
    },
    [],
  );
  const setExportResolution = useCallback(
    (resolution: VideoComposeExportDialogState["resolution"]) => {
      setExportDialog((current) => ({ ...current, resolution }));
    },
    [],
  );
  const closeExportDialog = useCallback(() => {
    setExportDialog((current) => ({ ...current, open: false }));
  }, []);
  const confirmExport = useCallback(() => {
    const { location, resolution } = exportDialog;
    setExportDialog((current) => ({ ...current, open: false }));
    void runExport(location, resolution);
  }, [exportDialog, runExport]);

  const {
    videoRef,
    audioRef,
    trackScrollRef,
    playheadElRef,
    playheadRef,
    previewStageRef,
    pxPerMs,
    pxPerMsRef,
    durationMs,
    playheadMs,
    isPlaying,
    toggle,
    seek,
    handleFullscreenPlay,
    videoTrack,
    audioTrack,
    videoSource,
  } = useVideoComposePlaybackController(timeline, pxPerSec);
  const {
    selectedClip,
    canSplitInside,
    selectedSpeed,
    selectedSourceSpanMs,
    selectedVolume,
    selectedMuted,
    moveToNewTrack,
    removeClip,
    splitSelected,
    trimSelectedToPlayhead,
    setSelectedSpeed,
    setSelectedVolume,
    toggleSelectedMute,
    setClipMuted,
    duplicateSelected,
    copySelected,
    pasteClipboard,
    removeSelected,
  } = useVideoComposeTimelineEditorController({
    timeline,
    timelineRef,
    selected,
    selectedIds,
    playheadMs,
    videoTrack,
    audioTrack,
    createClipId: makeClipId,
    createTrackId: makeTrackId,
    applyTimelineEdit,
    pushHistory,
    selectOnly,
    clearSelection,
    removeFromSelection,
  });

  const snapRef = useRef(snapEnabled);
  snapRef.current = snapEnabled;
  const { dragGhost, trimEdit, startClipMove, startTrim, startScrub } =
    useVideoComposeTimelinePointerController({
      timelineRef,
      pxPerMsRef,
      snapEnabledRef: snapRef,
      trackScrollRef,
      createTrackId: makeTrackId,
      updateTimelineTracks,
      applyTimelineEdit,
      pushHistory,
      selectOnly,
      toggleInSelection,
      seek,
    });

  useVideoComposeKeyboardController({
    coverEditorOpen,
    exportMenuOpen,
    speedOpen,
    volumeOpen,
    exportDialogOpen: exportDialog.open,
    isExporting,
    setCoverEditorOpen,
    setExportMenuOpen,
    setSpeedOpen,
    setVolumeOpen,
    onClose,
    undo,
    redo,
    copySelected,
    pasteClipboard,
    duplicateSelected,
    removeSelected,
    togglePlayback: toggle,
    playheadRef,
    durationMs,
    seek,
  });

  const zoomIn = useCallback(
    () =>
      setPxPerSec((value) =>
        clamp(value * ZOOM_STEP, MIN_PX_PER_SEC, MAX_PX_PER_SEC),
      ),
    [],
  );
  const zoomOut = useCallback(
    () =>
      setPxPerSec((value) =>
        clamp(value / ZOOM_STEP, MIN_PX_PER_SEC, MAX_PX_PER_SEC),
      ),
    [],
  );

  const hasClips = hasExportableClips(timeline);
  const canExport = hasClips && !isExporting;
  const overlapClipIds = useMemo(
    () => overlappingVideoClipIds(timeline),
    [timeline],
  );

  return (
    <VideoComposeModalView
      timeline={timeline}
      header={{
        coverDisplayUrl: timeline.cover?.url
          ? resolveImageDisplayUrl(timeline.cover.url)
          : null,
        canSetCover: hasClips,
        onOpenCoverEditor: () => setCoverEditorOpen(true),
        onClose,
      }}
      exportPanel={{
        canExport,
        isExporting,
        error: exportError,
        menuOpen: exportMenuOpen,
        dialog: exportDialog,
        onMenuOpenChange: setExportMenuOpen,
        onOpenDialog: openExportDialog,
        onDialogLocationChange: setExportLocation,
        onDialogResolutionChange: setExportResolution,
        onCloseDialog: closeExportDialog,
        onConfirmDialog: confirmExport,
      }}
      preview={{
        videoRef,
        audioRef,
        stageRef: previewStageRef,
        videoSource,
      }}
      toolbar={{
        canUndo,
        canRedo,
        hasSelectedClip: selectedClip !== null,
        canSplitInside,
        speedOpen,
        selectedSpeed,
        selectedSourceSpanMs,
        volumeOpen,
        selectedVolume,
        selectedMuted,
        playheadMs,
        durationMs,
        isPlaying,
        snapEnabled,
        pxPerSec,
        minPxPerSec: MIN_PX_PER_SEC,
        maxPxPerSec: MAX_PX_PER_SEC,
        onUndo: undo,
        onRedo: redo,
        onSplit: splitSelected,
        onTrimToPlayhead: trimSelectedToPlayhead,
        onSpeedOpenChange: setSpeedOpen,
        onSpeedChange: setSelectedSpeed,
        onVolumeOpenChange: setVolumeOpen,
        onVolumeChange: setSelectedVolume,
        onVolumeGestureStart: pushHistory,
        onToggleMute: toggleSelectedMute,
        onDuplicate: duplicateSelected,
        onRemoveSelected: removeSelected,
        onTogglePlayback: toggle,
        onResetToUpstream: resetToUpstream,
        onSnapEnabledChange: setSnapEnabled,
        onZoomChange: setPxPerSec,
        onZoomOut: zoomOut,
        onZoomIn: zoomIn,
        onFullscreenPlay: handleFullscreenPlay,
      }}
      timelineSurface={{
        pxPerSec,
        pxPerMs,
        durationMs,
        selected,
        selectedIds,
        overlapClipIds,
        dragGhost,
        trimEdit,
        trackScrollRef,
        playheadElRef,
        onStartScrub: startScrub,
        onClearSelection: clearSelection,
        onStartClipMove: startClipMove,
        onTrim: startTrim,
        onMoveToNewTrack: moveToNewTrack,
        onRemoveClip: removeClip,
        onSetClipMuted: setClipMuted,
      }}
      coverEditor={
        coverEditorOpen ? (
          <CoverEditor
            project={project}
            timeline={timeline}
            durationMs={durationMs}
            defaultFrameMs={playheadMs}
            cover={timeline.cover ?? null}
            onCancel={() => setCoverEditorOpen(false)}
            onApply={applyCover}
          />
        ) : null
      }
    />
  );
}
