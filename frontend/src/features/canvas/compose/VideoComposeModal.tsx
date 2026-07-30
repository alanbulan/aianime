// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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

import { resolveImageDisplayUrl } from "@/features/canvas/application/imageData";
import {
  buildVideoComposeInitialTimeline,
  resolveVideoComposeInitialTimeline,
} from "@/features/canvas/application/videoComposeTimelineSession";
import type { CanvasNode } from "@/features/canvas/domain/canvasNodes";
import type { CanvasVideoComposeResolution } from "@/features/canvas/domain/videoCompose";
import {
  applyVideoComposeTimelineEdit,
  resolveVideoComposeClipSelection,
  type VideoComposeClipReference,
  type VideoComposeTimelineEdit,
} from "@/features/canvas/domain/videoComposeTimelineEdits";
import {
  hasExportableClips,
  overlappingVideoClipIds,
  sourceSpanMs,
  type ComposeClip,
  type ComposeCover,
  type ComposeTimelineState,
} from "@/features/canvas/domain/videoComposeTimeline";
import { probeVideoComposeMediaDuration } from "@/features/canvas/infrastructure/browserVideoComposeMediaRuntime";
import { useVideoComposeExportController } from "@/features/canvas/hooks/useVideoComposeExportController";
import { useVideoComposeKeyboardController } from "@/features/canvas/hooks/useVideoComposeKeyboardController";
import { useVideoComposePlaybackController } from "@/features/canvas/hooks/useVideoComposePlaybackController";
import { useVideoComposeTimelinePointerController } from "@/features/canvas/hooks/useVideoComposeTimelinePointerController";
import { VideoComposeTrackRow } from "@/features/canvas/ui/VideoComposeTrackRow";
import {
  VideoComposeSpeedPopover,
  VideoComposeToolButton,
  VideoComposeToolDivider,
  VideoComposeVolumePopover,
  VideoComposeZoomInGlyph,
  VideoComposeZoomOutGlyph,
} from "@/features/canvas/ui/VideoComposeTimelineControls";
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
const RULER_MIN_SECONDS = 10;
const HISTORY_LIMIT = 50;
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function makeClipId(): string {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTrackId(): string {
  return `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  // 合成弹窗打开期间标记为「沉浸式」：画布的全局快捷键（Delete 删节点、⌘C/⌘V、⌘Z…）
  // 整体让位，避免弹窗内按 Delete 删片段却把画布上的视频合成节点也删了、并弹回画布。
  useViewerImmersiveBody(true);
  const [timeline, setTimeline] = useState<ComposeTimelineState>(() =>
    resolveVideoComposeInitialTimeline({
      initialTimeline,
      nodes: sourceNodes,
      seedNodeIds,
      createClipId: makeClipId,
    }),
  );
  const { isExporting, exportError, runExport } =
    useVideoComposeExportController({
      project,
      canvasId,
      timeline,
      onComposed,
      overlapErrorMessage: t("videoCompose.error.overlap"),
      missingUrlErrorMessage: t("videoCompose.error.noUrl"),
    });
  const [past, setPast] = useState<ComposeTimelineState[]>([]);
  const [future, setFuture] = useState<ComposeTimelineState[]>([]);
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const [snapEnabled, setSnapEnabled] = useState(true);
  // selected = 主选中（驱动变速/音量/分割等编辑面板）；selectedIds = 全部选中片段 id
  // （高亮 + 批量删除）。Shift/⌘ 点选叠加到 selectedIds，普通点选收敛为单选。
  const [selected, setSelected] =
    useState<VideoComposeClipReference | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [speedOpen, setSpeedOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportDialog, setExportDialog] = useState<{
    open: boolean;
    location: "local" | "canvas";
    resolution: CanvasVideoComposeResolution;
  }>({ open: false, location: "local", resolution: "1080p" });
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);

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
  // 收敛为单选：主选中 + 高亮集合都设成这一片段（或清空）。
  const selectOnly = useCallback((ref: VideoComposeClipReference | null) => {
    setSelected(ref);
    setSelectedIds(ref ? new Set([ref.clipId]) : new Set());
  }, []);
  const clearSelection = useCallback(() => {
    setSelected(null);
    setSelectedIds(new Set());
  }, []);
  // Shift/⌘ 叠加点选：在高亮集合里增删该片段；加入时把它设为主选中。
  // 取消的若是主选中，必须同步清掉 selected —— 否则它仍是高亮/删除/编辑面板的
  // 目标，表现为「主选中片段 shift-click 取消不掉」。
  const toggleInSelection = useCallback(
    (ref: VideoComposeClipReference) => {
      const removing = selectedIds.has(ref.clipId);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (removing) next.delete(ref.clipId);
        else next.add(ref.clipId);
        return next;
      });
      if (removing) {
        setSelected((cur) => (cur?.clipId === ref.clipId ? null : cur));
      } else {
        setSelected(ref);
      }
    },
    [selectedIds],
  );

  const snapRef = useRef(snapEnabled);
  snapRef.current = snapEnabled;
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  // ⌘C 复制的片段快照（⌘V 时插入其副本）。
  const clipboardRef = useRef<ComposeClip | null>(null);

  // ── history (undo / redo) ────────────────────────────────────────────────
  const pushHistory = useCallback(() => {
    setPast((prev) => [...prev, timelineRef.current].slice(-HISTORY_LIMIT));
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      setFuture((f) => [timelineRef.current, ...f]);
      setTimeline(previous);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[0];
      setPast((p) => [...p, timelineRef.current].slice(-HISTORY_LIMIT));
      setTimeline(next);
      return prev.slice(1);
    });
  }, []);

  const applyTimelineEdit = useCallback((edit: VideoComposeTimelineEdit) => {
    setTimeline((previous) =>
      applyVideoComposeTimelineEdit(previous, edit),
    );
  }, []);

  // ── duration probing (no history) ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const pending = timeline.tracks.flatMap((track) =>
      track.clips
        .filter((clip) => clip.durationMs == null)
        .map((clip) => ({ trackId: track.id, clip, kind: track.kind })),
    );
    if (pending.length === 0) return;
    void Promise.all(
      pending.map(async ({ trackId, clip, kind }) => {
        const probed = await probeVideoComposeMediaDuration(
          clip.sourceUrl,
          kind,
          resolveImageDisplayUrl,
        );
        if (cancelled || probed == null) return;
        applyTimelineEdit({
          type: "resolveClipDuration",
          target: { trackId, clipId: clip.id },
          durationMs: probed,
        });
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [
    applyTimelineEdit,
    timeline.tracks
      .flatMap((track) => track.clips.map((c) => `${c.id}:${c.durationMs == null}`))
      .join(","),
  ]);

  // 关闭弹窗（卸载）时把当前时间线回传宿主存为草稿，重开/刷新后恢复。
  const onPersistDraftRef = useRef(onPersistDraft);
  onPersistDraftRef.current = onPersistDraft;
  useEffect(() => {
    return () => {
      onPersistDraftRef.current?.(timelineRef.current);
    };
  }, []);

  // 设置 / 更新封面（history-tracked），关闭封面编辑器。
  const applyCover = useCallback(
    (cover: ComposeCover) => {
      pushHistory();
      setTimeline((prev) => ({ ...prev, cover }));
      setCoverEditorOpen(false);
    },
    [pushHistory],
  );

  // 重新从上游素材摆放（丢弃当前草稿编辑）—— 上游新增/变更素材后用它重置。
  const resetToUpstream = useCallback(() => {
    pushHistory();
    setTimeline(
      buildVideoComposeInitialTimeline(
        sourceNodes,
        seedNodeIds,
        makeClipId,
      ),
    );
    clearSelection();
  }, [clearSelection, pushHistory, seedNodeIds, sourceNodes]);

  const updateTimelineTracks = useCallback(
    (tracks: ComposeTimelineState["tracks"]) => {
      setTimeline((previous) => ({ ...previous, tracks }));
    },
    [],
  );
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

  // 把片段移到「新的一行」：新建同种类轨道承载该片段（保留时间位置），从原轨移除；
  // 清掉因此变空的非默认轨道。
  const moveToNewTrack = useCallback(
    (trackId: string, clipId: string) => {
      const src = timelineRef.current.tracks.find((t) => t.id === trackId);
      const clip = src?.clips.find((c) => c.id === clipId);
      if (!src || !clip) return;
      const newTrackId = makeTrackId();
      pushHistory();
      applyTimelineEdit({
        type: "moveClipToNewTrack",
        target: { trackId, clipId },
        newTrackId,
      });
      selectOnly({ trackId: newTrackId, clipId });
    },
    [applyTimelineEdit, pushHistory, selectOnly],
  );

  const removeClip = useCallback(
    (trackId: string, clipId: string) => {
      pushHistory();
      applyTimelineEdit({
        type: "removeClip",
        target: { trackId, clipId },
      });
      setSelected((cur) => (cur?.clipId === clipId ? null : cur));
      setSelectedIds((prev) => {
        if (!prev.has(clipId)) return prev;
        const next = new Set(prev);
        next.delete(clipId);
        return next;
      });
    },
    [applyTimelineEdit, pushHistory],
  );

  // ── selected clip + playhead-relative source position ────────────────────
  const selectedClip = useMemo(
    () => resolveVideoComposeClipSelection(timeline, selected, playheadMs),
    [playheadMs, selected, timeline],
  );
  const selectedSourceMs = selectedClip?.sourceMsAtPlayhead ?? null;
  const canSplitInside = selectedClip?.canSplitAtPlayhead ?? false;

  const splitSelected = useCallback(() => {
    if (!selectedClip || selectedSourceMs == null || !canSplitInside) return;
    const leftId = makeClipId();
    const rightId = makeClipId();
    pushHistory();
    applyTimelineEdit({
      type: "splitClip",
      target: {
        trackId: selectedClip.track.id,
        clipId: selectedClip.clip.id,
      },
      sourceMs: selectedSourceMs,
      leftClipId: leftId,
      rightClipId: rightId,
    });
    selectOnly({ trackId: selectedClip.track.id, clipId: leftId });
  }, [
    applyTimelineEdit,
    canSplitInside,
    pushHistory,
    selectOnly,
    selectedClip,
    selectedSourceMs,
  ]);

  // 向左分割 / 向右分割 —— 删除选中片段在播放头一侧的部分（裁掉而非留两段）。
  const trimSelectedToPlayhead = useCallback(
    (side: "left" | "right") => {
      if (!selectedClip || !canSplitInside) return;
      pushHistory();
      applyTimelineEdit({
        type: "trimClipToPlayhead",
        target: {
          trackId: selectedClip.track.id,
          clipId: selectedClip.clip.id,
        },
        playheadMs,
        side,
      });
    },
    [
      applyTimelineEdit,
      canSplitInside,
      playheadMs,
      pushHistory,
      selectedClip,
    ],
  );

  const setSelectedSpeed = useCallback(
    (speed: number) => {
      if (!selectedClip) return;
      pushHistory();
      applyTimelineEdit({
        type: "setClipSpeed",
        target: {
          trackId: selectedClip.track.id,
          clipId: selectedClip.clip.id,
        },
        speed,
      });
    },
    [applyTimelineEdit, pushHistory, selectedClip],
  );

  // 音量滑杆 onChange 在一次拖动里触发数十次 —— 历史快照只在手势开始时 push 一次
  //（见 VideoComposeVolumePopover 的 onGestureStart），否则一次拖动就把整个撤销栈冲掉。
  const setSelectedVolume = useCallback(
    (volume: number) => {
      if (!selectedClip) return;
      applyTimelineEdit({
        type: "setClipVolume",
        target: {
          trackId: selectedClip.track.id,
          clipId: selectedClip.clip.id,
        },
        volume,
      });
    },
    [applyTimelineEdit, selectedClip],
  );

  const toggleSelectedMute = useCallback(() => {
    if (!selectedClip) return;
    pushHistory();
    applyTimelineEdit({
      type: "toggleClipMute",
      target: {
        trackId: selectedClip.track.id,
        clipId: selectedClip.clip.id,
      },
    });
  }, [applyTimelineEdit, pushHistory, selectedClip]);

  // ── 复制 / 粘贴 / 副本 ─────────────────────────────────────────────────────
  // 把 sourceClip 复制一份（新 id）插进目标轨：视频轨在 afterClipId 之后插入并整体无缝
  // 重排；音频轨追加到末尾（避免与现有片段重叠）。返回新片段 id 并选中它。
  const insertDuplicate = useCallback(
    (sourceClip: ComposeClip, trackId: string, afterClipId: string | null) => {
      const copyId = makeClipId();
      pushHistory();
      applyTimelineEdit({
        type: "insertClipCopy",
        sourceClip,
        targetTrackId: trackId,
        afterClipId,
        copyClipId: copyId,
      });
      selectOnly({ trackId, clipId: copyId });
    },
    [applyTimelineEdit, pushHistory, selectOnly],
  );

  const duplicateSelected = useCallback(() => {
    if (!selectedClip) return;
    insertDuplicate(selectedClip.clip, selectedClip.track.id, selectedClip.clip.id);
  }, [insertDuplicate, selectedClip]);

  const copySelected = useCallback(() => {
    if (!selectedClip) return;
    clipboardRef.current = { ...selectedClip.clip };
  }, [selectedClip]);

  const pasteClipboard = useCallback(() => {
    const src = clipboardRef.current;
    if (!src) return;
    // 落到同类型的默认轨；当前选中片段也在该轨时紧跟其后插入，否则追加。
    const targetTrackId = src.kind === "video" ? videoTrack?.id : audioTrack?.id;
    if (!targetTrackId) return;
    const afterId =
      selectedClip && selectedClip.track.id === targetTrackId
        ? selectedClip.clip.id
        : null;
    insertDuplicate(src, targetTrackId, afterId);
  }, [audioTrack, insertDuplicate, selectedClip, videoTrack]);

  // 批量删除当前所有选中片段（含主选中），删后视频轨补位、清空选择。
  const removeSelected = useCallback(() => {
    const ids = new Set(selectedIds);
    if (selected) ids.add(selected.clipId);
    if (ids.size === 0) return;
    pushHistory();
    applyTimelineEdit({ type: "removeClips", clipIds: ids });
    clearSelection();
  }, [applyTimelineEdit, clearSelection, pushHistory, selected, selectedIds]);

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

  // ── zoom ───────────────────────────────────────────────────────────────────
  const zoomIn = useCallback(
    () => setPxPerSec((v) => clamp(v * ZOOM_STEP, MIN_PX_PER_SEC, MAX_PX_PER_SEC)),
    [],
  );
  const zoomOut = useCallback(
    () => setPxPerSec((v) => clamp(v / ZOOM_STEP, MIN_PX_PER_SEC, MAX_PX_PER_SEC)),
    [],
  );

  const rulerSeconds = Math.max(RULER_MIN_SECONDS, Math.ceil(durationMs / 1000));
  const timelineWidthPx = rulerSeconds * pxPerSec;
  const canExport = hasExportableClips(timeline) && !isExporting;
  // 时间轴上重叠的视频片段 id —— 用于把冲突片段高亮（红框）提示用户。
  const overlapClipIds = useMemo(() => overlappingVideoClipIds(timeline), [timeline]);

  const selectedSpeed = selectedClip?.clip.speed ?? 1;
  const selectedSourceSpanMs = selectedClip ? sourceSpanMs(selectedClip.clip) : 0;
  const selectedVolume = selectedClip?.clip.volume ?? 1;
  const selectedMuted = selectedClip?.clip.muted ?? false;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border-dark px-5 py-3">
        <div className="flex items-center gap-2 text-text-dark">
          <Film className="h-5 w-5 text-text-muted" />
          <span className="text-sm font-semibold">{t("videoCompose.title")}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* 设置封面：独立入口，点开封面编辑器（选帧 / 上传）。已设封面时左侧带缩略图。 */}
          <button
            type="button"
            onClick={() => setCoverEditorOpen(true)}
            disabled={!hasExportableClips(timeline)}
            className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-foreground transition-colors hover:border-foreground/25 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {timeline.cover?.url ? (
              <img
                src={resolveImageDisplayUrl(timeline.cover.url)}
                alt=""
                className="h-5 w-[34px] rounded-[4px] object-cover"
              />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            {t("videoCompose.cover.button")}
          </button>
          {/* 不再提供 720p/1080p 切换：导出沿用源视频画质（默认 1080p，不降采样）。 */}
          {/* 导出下拉：自建轻量 popover —— 共享的 Base UI DropdownMenu 把菜单 portal 到
              body 且 Positioner 固定 z-50，会被本弹窗的 z-[120] 整层盖住（点了像没反应）。
              这里跟 VideoComposeSpeedPopover 一样用模态内的相对定位浮层，避开 z 冲突。 */}
          {/* hover 即展开（不是点击）。onMouseLeave 在指针离开按钮+菜单整体时才关闭：
              菜单是 wrapper 的 DOM 子节点，且用 pt-2 桥接视觉间隙，避免移到菜单途中关掉。 */}
          <div
            className="relative"
            onMouseEnter={() =>
              canExport && !exportDialog.open && setExportMenuOpen(true)
            }
            onMouseLeave={() => setExportMenuOpen(false)}
          >
            <button
              type="button"
              disabled={!canExport}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Film className="h-4 w-4" />
              )}
              {isExporting
                ? t("videoCompose.exporting")
                : t("videoCompose.export")}
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </button>
            {exportMenuOpen && canExport && !exportDialog.open && (
              <div className="absolute right-0 top-full z-30 pt-2">
                <div className="min-w-[180px] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-2xl">
                  <div className="px-2 py-1 text-xs text-text-muted">
                    {t("videoCompose.exportLocation")}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      setExportDialog({ open: true, location: "local", resolution: "1080p" });
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <Download className="h-4 w-4" />
                    {t("videoCompose.exportToLocal")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      setExportDialog({ open: true, location: "canvas", resolution: "1080p" });
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    {t("videoCompose.exportToCanvas")}
                  </button>
                </div>
              </div>
            )}
            {/* 导出设置弹窗：锚定在「导出」按钮正下方（参考 libtv），非屏幕居中。 */}
            {exportDialog.open && (
              <>
                <div
                  className="fixed inset-0 z-[135]"
                  onClick={() =>
                    !isExporting && setExportDialog((d) => ({ ...d, open: false }))
                  }
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
                        value={exportDialog.location}
                        onChange={(e) =>
                          setExportDialog((d) => ({
                            ...d,
                            location: e.target.value as "local" | "canvas",
                          }))
                        }
                        className="min-w-[160px] rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/45"
                      >
                        <option value="local">{t("videoCompose.exportToLocal")}</option>
                        <option value="canvas">{t("videoCompose.exportToCanvas")}</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-xs text-text-muted">
                        {t("videoCompose.exportDialog.resolution")}
                      </span>
                      <select
                        value={exportDialog.resolution}
                        onChange={(e) =>
                          setExportDialog((d) => ({
                            ...d,
                            resolution: e.target.value as CanvasVideoComposeResolution,
                          }))
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
                      disabled={isExporting}
                      onClick={() => setExportDialog((d) => ({ ...d, open: false }))}
                      className="rounded-md border border-border bg-muted px-4 py-1.5 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => {
                        const { location, resolution } = exportDialog;
                        setExportDialog((d) => ({ ...d, open: false }));
                        void runExport(location, resolution);
                      }}
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
            onClick={onClose}
            disabled={isExporting}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {exportError && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-destructive">
          {t("videoCompose.error.prefix")}: {exportError}
        </div>
      )}

      {/* Preview stage */}
      <div
        ref={previewStageRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-media/60 p-4"
      >
        <video
          ref={videoRef}
          className="max-h-full max-w-full rounded-lg bg-media"
          playsInline
          style={{ display: videoSource ? "block" : "none" }}
        />
        {!videoSource && (
          <div className="text-sm text-media-foreground/70">
            {t("videoCompose.emptyPreview")}
          </div>
        )}
        <audio ref={audioRef} className="hidden" />
      </div>

      {/* Toolbar */}
      <div className="relative flex items-center justify-between gap-4 border-t border-border-dark px-4 py-2">
        {/* Left: edit actions */}
        <div className="flex items-center gap-0.5">
          <VideoComposeToolButton icon={Undo2} label={t("videoCompose.undo")} disabled={past.length === 0} onClick={undo} />
          <VideoComposeToolButton icon={Redo2} label={t("videoCompose.redo")} disabled={future.length === 0} onClick={redo} />
          <VideoComposeToolDivider />
          <VideoComposeToolButton icon={Split} label={t("videoCompose.split")} disabled={!canSplitInside} onClick={splitSelected} />
          <VideoComposeToolButton
            icon={ArrowLeftToLine}
            label={t("videoCompose.splitLeft")}
            disabled={!canSplitInside}
            onClick={() => trimSelectedToPlayhead("left")}
          />
          <VideoComposeToolButton
            icon={ArrowRightToLine}
            label={t("videoCompose.splitRight")}
            disabled={!canSplitInside}
            onClick={() => trimSelectedToPlayhead("right")}
          />
          <div className="relative">
            <VideoComposeToolButton
              icon={Gauge}
              label={t("videoCompose.speed")}
              disabled={!selectedClip}
              active={speedOpen}
              onClick={() => setSpeedOpen((open) => !open)}
            />
            {speedOpen && selectedClip && (
              <VideoComposeSpeedPopover
                speed={selectedSpeed}
                sourceSpanMs={selectedSourceSpanMs}
                onChange={setSelectedSpeed}
                onClose={() => setSpeedOpen(false)}
              />
            )}
          </div>
          <div className="relative">
            <VideoComposeToolButton
              icon={selectedMuted || selectedVolume <= 0 ? VolumeX : Volume2}
              label={t("videoCompose.volume")}
              disabled={!selectedClip}
              active={volumeOpen}
              onClick={() => setVolumeOpen((open) => !open)}
            />
            {volumeOpen && selectedClip && (
              <VideoComposeVolumePopover
                volume={selectedVolume}
                muted={selectedMuted}
                onChange={setSelectedVolume}
                onGestureStart={pushHistory}
                onToggleMute={toggleSelectedMute}
                onClose={() => setVolumeOpen(false)}
              />
            )}
          </div>
          <VideoComposeToolButton
            icon={Copy}
            label={t("videoCompose.duplicate")}
            disabled={!selectedClip}
            onClick={duplicateSelected}
          />
          <VideoComposeToolButton
            icon={Trash2}
            label={t("videoCompose.removeClip")}
            disabled={!selectedClip}
            onClick={removeSelected}
          />
        </div>

        {/* Center: transport + snap */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {formatTime(playheadMs)}
          </span>
          <button
            type="button"
            onClick={toggle}
            disabled={durationMs <= 0}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-accent disabled:opacity-40"
            aria-label={isPlaying ? t("videoCompose.pause") : t("videoCompose.play")}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {formatTime(durationMs)}
          </span>
        </div>

        {/* Right: reset + snap + zoom + fullscreen */}
        <div className="flex items-center gap-1">
          <VideoComposeToolButton
            icon={RotateCcw}
            label={t("videoCompose.resetToUpstream")}
            onClick={resetToUpstream}
          />
          <VideoComposeToolDivider />
          <VideoComposeToolButton
            icon={Magnet}
            label={t("videoCompose.snap")}
            active={snapEnabled}
            onClick={() => setSnapEnabled((v) => !v)}
          />
          <VideoComposeToolDivider />
          <VideoComposeToolButton icon={VideoComposeZoomOutGlyph} label={t("videoCompose.zoomOut")} disabled={pxPerSec <= MIN_PX_PER_SEC} onClick={zoomOut} />
          <input
            type="range"
            min={MIN_PX_PER_SEC}
            max={MAX_PX_PER_SEC}
            step={1}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="h-1 w-24 cursor-pointer accent-primary"
            aria-label={t("videoCompose.zoom")}
          />
          <VideoComposeToolButton icon={VideoComposeZoomInGlyph} label={t("videoCompose.zoomIn")} disabled={pxPerSec >= MAX_PX_PER_SEC} onClick={zoomIn} />
          <VideoComposeToolDivider />
          <VideoComposeToolButton
            icon={Maximize}
            label={t("videoCompose.fullscreenPlay")}
            disabled={durationMs <= 0}
            onClick={handleFullscreenPlay}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="h-[260px] shrink-0 overflow-hidden border-t border-border bg-card">
        <div ref={trackScrollRef} className="ui-scrollbar-vertical h-full overflow-auto">
          <div className="relative min-h-full" style={{ width: timelineWidthPx, minWidth: "100%" }}>
            {/* Ruler */}
            <div
              className="relative h-7 cursor-pointer select-none border-b border-border-dark"
              onPointerDown={startScrub}
            >
              {Array.from({ length: rulerSeconds + 1 }, (_, sec) => (
                <div
                  key={sec}
                  className="absolute top-0 flex h-full flex-col justify-center"
                  style={{ left: sec * pxPerSec }}
                >
                  <div className="h-2 w-px bg-border-dark" />
                  <span className="ml-1 text-[10px] tabular-nums text-text-muted">
                    {formatTime(sec * 1000)}
                  </span>
                </div>
              ))}
            </div>

            {/* Tracks */}
            <div className="space-y-2 p-2" onPointerDown={() => clearSelection()}>
              {timeline.tracks.map((track) => (
                <VideoComposeTrackRow
                  key={track.id}
                  track={track}
                  pxPerMs={pxPerMs}
                  selectedClipId={selected?.clipId ?? null}
                  selectedIds={selectedIds}
                  overlapClipIds={overlapClipIds}
                  draggingClipId={dragGhost?.clipId ?? null}
                  ghostLeftPx={
                    dragGhost && dragGhost.trackId === track.id
                      ? dragGhost.ghostLeftPx
                      : null
                  }
                  trimmingClipId={trimEdit?.clipId ?? null}
                  trimEdge={trimEdit?.edge ?? null}
                  onStartClipMove={startClipMove}
                  onTrim={startTrim}
                  onMoveToNewTrack={moveToNewTrack}
                  onRemove={removeClip}
                  onToggleMute={(clipId, muted) => {
                    pushHistory();
                    applyTimelineEdit({
                      type: "updateClip",
                      target: { trackId: track.id, clipId },
                      patch: { muted },
                    });
                  }}
                />
              ))}
            </div>

            {/* Playhead (draggable) —— 位置由 playback controller 命令式写 transform，
                不绑 React state，避免播放时被整树重渲染拖卡。translateX 走合成层，
                不触发 layout。 */}
            <div
              ref={playheadElRef}
              className="pointer-events-none absolute top-0 bottom-0 left-0 z-20"
              // transform 不放进 JSX style：否则播放时被节流的 state 重渲染会把竖线
              // 拽回旧位置再被 onFrame 拉回，产生抖动。位置一律命令式设置。
              style={{ willChange: "transform" }}
            >
              {/* 可见的细竖线 */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-primary" />
              {/* 加宽的透明抓取条（触发块）：覆盖整条高度，居中对齐竖线，任意高度都能
                  抓住拖动。仅 ~11px 宽，落在竖线上随它移动，对片段点击的影响极小。 */}
              <div
                className="pointer-events-auto absolute inset-y-0 -left-[5px] w-[11px] cursor-ew-resize"
                onPointerDown={startScrub}
              />
              {/* 顶部圆点把手 */}
              <div
                className="pointer-events-auto absolute -left-[5px] -top-1 h-3 w-3 cursor-ew-resize rounded-full bg-primary shadow"
                onPointerDown={startScrub}
              />
            </div>
          </div>
        </div>
      </div>

      {coverEditorOpen && (
        <CoverEditor
          project={project}
          timeline={timeline}
          durationMs={durationMs}
          defaultFrameMs={playheadMs}
          cover={timeline.cover ?? null}
          onCancel={() => setCoverEditorOpen(false)}
          onApply={applyCover}
        />
      )}
    </div>,
    document.body,
  );
}
