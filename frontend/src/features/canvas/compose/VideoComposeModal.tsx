// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Film,
  Gauge,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Magnet,
  Maximize,
  Minus,
  Music,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Rows3,
  Split,
  Trash2,
  Undo2,
  Video as VideoIcon,
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
  VIDEO_COMPOSE_MAX_SPEED,
  VIDEO_COMPOSE_MIN_SPEED,
  type VideoComposeClipReference,
  type VideoComposeTimelineEdit,
} from "@/features/canvas/domain/videoComposeTimelineEdits";
import {
  createVideoComposeClipDragSession,
  createVideoComposeTrimDragSession,
  projectVideoComposeClipDrag,
  projectVideoComposeTrimDrag,
  snapVideoComposePlayhead,
} from "@/features/canvas/domain/videoComposeTimelineGestures";
import {
  activeClipAt,
  clipLengthMs,
  hasExportableClips,
  layoutTrack,
  overlappingVideoClipIds,
  sourceSpanMs,
  timelineDurationMs,
  type ComposeClip,
  type ComposeCover,
  type ComposeTimelineState,
  type ComposeTrack,
  type ComposeTrackKind,
} from "@/features/canvas/domain/videoComposeTimeline";
import { probeVideoComposeMediaDuration } from "@/features/canvas/infrastructure/browserVideoComposeMediaRuntime";
import { useVideoComposeExportController } from "@/features/canvas/hooks/useVideoComposeExportController";
import { useVideoComposeTrackMediaSync } from "@/features/canvas/hooks/useVideoComposeTrackMediaSync";
import { useViewerImmersiveBody } from "@/features/viewer-kit/useViewerImmersiveBody";
import {
  getCachedAudioPeaks,
  loadAudioPeaks,
  PEAK_BUCKETS_PER_SEC,
} from "./audioPeaks";
import { CoverEditor } from "./CoverEditor";
import { useComposePlayback } from "./useComposePlayback";
import { getFilmstrip, pickFrame, type FilmstripFrame } from "./filmstrip";

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
const FILMSTRIP_THUMB_W = 72;
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

/** 片段时长时间码 HH:MM:SS:FF（默认 30fps），用于片段标签。 */
function formatTimecode(ms: number, fps = 30): string {
  const totalMs = Math.max(0, Math.round(ms));
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const f = Math.min(fps - 1, Math.floor(((totalMs % 1000) / 1000) * fps));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
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
  // 拖动中的「投影轨迹」：被拖片段会在落点槽位留一道半透明投影，同时跟随指针浮起一个
  // 幽灵副本（libtv / 剪映式）。null = 当前没有片段在拖动。
  const [dragGhost, setDragGhost] = useState<{
    clipId: string;
    trackId: string;
    /** 跟随指针的幽灵副本左缘（px，相对所在轨道的内容区）。 */
    ghostLeftPx: number;
  } | null>(null);
  // 正在裁剪的片段（用于在其边缘浮一个「裁剪后时长」气泡）。null = 没在裁剪。
  const [trimEdit, setTrimEdit] = useState<{
    clipId: string;
    edge: "start" | "end";
  } | null>(null);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportDialog, setExportDialog] = useState<{
    open: boolean;
    location: "local" | "canvas";
    resolution: CanvasVideoComposeResolution;
  }>({ open: false, location: "local", resolution: "1080p" });
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackScrollRef = useRef<HTMLDivElement | null>(null);
  // 当前正在进行的拖动（clip 移动 / trim / scrub）的清理函数。用于：① 同一时刻只允许
  // 一个拖动（多指/多触点防重复挂监听）；② 组件卸载（关弹窗）时清掉残留的 window 监听，
  // 避免对已卸载组件 setState。
  const activeDragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      activeDragCleanupRef.current?.();
      activeDragCleanupRef.current = null;
    },
    [],
  );

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

  const pxPerMs = pxPerSec / 1000;
  const pxPerMsRef = useRef(pxPerMs);
  pxPerMsRef.current = pxPerMs;
  const snapRef = useRef(snapEnabled);
  snapRef.current = snapEnabled;
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  // ⌘C 复制的片段快照（⌘V 时插入其副本）。
  const clipboardRef = useRef<ComposeClip | null>(null);

  const durationMs = useMemo(() => timelineDurationMs(timeline), [timeline]);

  // 竖线 DOM 直驱：rAF 时钟每帧通过这个 ref 改 transform，绕开 React 重渲染，
  // 整条时间轴（filmstrip 等）便不再被播放头每帧带着重渲染。
  const playheadElRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(false);
  const positionPlayhead = useCallback((ms: number) => {
    const x = ms * pxPerMsRef.current;
    const el = playheadElRef.current;
    if (el) el.style.transform = `translateX(${x}px)`;
    // 播放时让时间轴平滑跟随播放头：命令式改 scrollLeft（不触发 React 重渲染），
    // 播放头逼近视口左右边缘时才滚动，保持其始终在 margin 内 —— 连续播放时即表现
    // 为时间轴匀速跟随。手动 scrub / 暂停态不跟随（playingRef 为 false）。
    if (playingRef.current) {
      const cont = trackScrollRef.current;
      if (cont) {
        const view = cont.clientWidth;
        const margin = Math.min(96, view * 0.2);
        const left = cont.scrollLeft;
        if (x > left + view - margin) cont.scrollLeft = x - view + margin;
        else if (x < left + margin) cont.scrollLeft = Math.max(0, x - margin);
      }
    }
  }, []);

  // 横向滚动条已隐藏（ui-scrollbar-vertical），改用 Ctrl + 滚轮做横向滚动。
  // 必须挂原生非 passive 监听才能 preventDefault 掉浏览器默认的 Ctrl+滚轮缩放
  // —— React 合成 onWheel 在 root 上是 passive，preventDefault 无效。
  useEffect(() => {
    const cont = trackScrollRef.current;
    if (!cont) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      cont.scrollLeft += event.deltaY !== 0 ? event.deltaY : event.deltaX;
    };
    cont.addEventListener("wheel", onWheel, { passive: false });
    return () => cont.removeEventListener("wheel", onWheel);
  }, []);

  // 播放态媒体主时钟：把正在播放的视频元素的 currentTime 反算回时间线 ms，让竖线
  // 跟真实解码帧走，画面与竖线严丝合缝（libtv 效果）。边界 / 缓冲 / 无视频时返回
  // null，交回墙钟推进。activeVideoRef 在下方随激活片段更新。
  const activeVideoRef = useRef<{
    clipId: string;
    timelineStartMs: number;
    timelineEndMs: number;
    trimStartMs: number;
    speed: number;
  } | null>(null);
  const mediaClockMs = useCallback((): number | null => {
    const el = videoRef.current;
    const a = activeVideoRef.current;
    if (!el || !a) return null;
    if (el.paused || el.seeking || el.readyState < 2) return null;
    // 元素当前装载的片段必须与映射所用片段一致；换源瞬间不一致时交回墙钟推进，
    // 否则会用错片段的时间线偏移，把竖线算回上一段（画面已是下一段）。
    if (el.dataset.clipId !== a.clipId) return null;
    const speed = a.speed > 0 ? a.speed : 1;
    const ms = a.timelineStartMs + (el.currentTime * 1000 - a.trimStartMs) / speed;
    if (ms < a.timelineStartMs - 60 || ms > a.timelineEndMs + 60) return null;
    return ms;
  }, []);

  const { playheadMs, isPlaying, play, toggle, seek } = useComposePlayback(
    durationMs,
    positionPlayhead,
    mediaClockMs,
  );
  // 播放头当前值的 ref —— 给快捷键（←/→ 微移）读最新值，免得把 playheadMs 列进
  // keydown effect 依赖、播放时每帧重挂监听。
  const playheadRef = useRef(playheadMs);
  playheadRef.current = playheadMs;

  // 全屏播放：对预览舞台容器（非 <video> 本身）请求全屏，避免片段换源时退出全屏；
  // 从头播放整条时间线。
  const previewStageRef = useRef<HTMLDivElement>(null);
  const handleFullscreenPlay = useCallback(() => {
    const el = previewStageRef.current;
    if (el?.requestFullscreen) void el.requestFullscreen().catch(() => {});
    seek(0);
    play();
  }, [play, seek]);
  playingRef.current = isPlaying;

  // 非播放态（seek / 暂停 / 缩放）由 React state 兜底定位；播放态交给 onFrame
  // 每帧直驱，避免被节流后的 state 拽回造成跳动。
  useEffect(() => {
    if (!isPlaying) positionPlayhead(playheadMs);
  }, [playheadMs, pxPerSec, isPlaying, positionPlayhead]);

  // 多轨预览：单个 <video>/<audio> 无法合成多轨，预览取「播放头处有片段」的最上层
  // （数组靠后）轨道；无则取第一条该种类轨道。最终导出由后端按全部轨道合成。
  const videoTrack = useMemo(() => {
    const vids = timeline.tracks.filter((track) => track.kind === "video");
    for (let i = vids.length - 1; i >= 0; i -= 1) {
      if (activeClipAt(vids[i], playheadMs)) return vids[i];
    }
    return vids[0] ?? null;
  }, [timeline, playheadMs]);
  const audioTrack = useMemo(() => {
    const auds = timeline.tracks.filter((track) => track.kind === "audio");
    for (let i = auds.length - 1; i >= 0; i -= 1) {
      if (activeClipAt(auds[i], playheadMs)) return auds[i];
    }
    return auds[0] ?? null;
  }, [timeline, playheadMs]);
  const hasAudioTrack = useMemo(
    () =>
      timeline.tracks.some(
        (track) => track.kind === "audio" && track.clips.length > 0,
      ),
    [timeline],
  );

  useVideoComposeTrackMediaSync(
    videoRef,
    videoTrack,
    playheadMs,
    isPlaying,
    hasAudioTrack,
  );
  useVideoComposeTrackMediaSync(
    audioRef,
    audioTrack,
    playheadMs,
    isPlaying,
    false,
  );

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

  // 指针 Y 命中目标轨道：落在某条同种类轨道行内 → 该轨；落到所有同种类行下方 →
  // "new"（拖出一条新行）；行间 / 上方 → null（不改变轨道）。靠 DOM 行 rect 命中。
  const resolveDropTrack = useCallback(
    (kind: ComposeTrackKind, clientY: number): { trackId: string } | "new" | null => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-compose-track-id]"),
      )
        .filter((el) => el.dataset.composeTrackKind === kind)
        .map((el) => ({
          id: el.dataset.composeTrackId as string,
          rect: el.getBoundingClientRect(),
        }))
        .sort((a, b) => a.rect.top - b.rect.top);
      if (rows.length === 0) return null;
      for (const row of rows) {
        if (clientY >= row.rect.top && clientY <= row.rect.bottom) {
          return { trackId: row.id };
        }
      }
      const last = rows[rows.length - 1];
      return clientY > last.rect.bottom ? "new" : null;
    },
    [],
  );

  // 拖动片段本体：横向改时间位置（同轨防重叠 + 磁吸），纵向拖到新行直接新建同种类
  // 轨道承载；拖回已有轨道则把本次新建、已空的轨道删掉。带 4px 阈值区分点选/拖动。
  // 用 window 监听（不用 setPointerCapture）—— 片段跨轨道会重新挂载 DOM，捕获会丢失。
  const startClipMove = useCallback(
    (event: ReactPointerEvent, track: ComposeTrack, clip: ComposeClip) => {
      event.stopPropagation();
      event.preventDefault();
      // Shift/⌘ 点选：叠加/取消选中该片段，不进入拖动。
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        toggleInSelection({ trackId: track.id, clipId: clip.id });
        return;
      }
      if (activeDragCleanupRef.current) return; // 已有拖动在进行，忽略并发触发
      const dragSession = createVideoComposeClipDragSession(
        timelineRef.current,
        { trackId: track.id, clipId: clip.id },
      );
      if (!dragSession) return;
      selectOnly({ trackId: track.id, clipId: clip.id });
      const startX = event.clientX;
      const startY = event.clientY;
      const { clipId, kind } = dragSession;
      let currentTrackId = track.id;
      let autoCreatedTrackId: string | null = null;
      let moved = false;
      let rafId = 0;
      let latest = { x: startX, y: startY };

      const apply = () => {
        rafId = 0;
        const { x: clientX, y: clientY } = latest;
        const dxMs = (clientX - startX) / pxPerMsRef.current;
        // 以「最新已提交状态」为基准同步计算整帧结果，并在落地前做防御性跳过 ——
        // 失败就整帧不动（不改 state、不动闭包变量），片段保持上一个合法位置。
        const snapshot = timelineRef.current;
        const drop = resolveDropTrack(kind, clientY);
        const prevAuto = autoCreatedTrackId;
        const createId = drop === "new" && !prevAuto ? makeTrackId() : null;
        let destId = currentTrackId;
        if (drop === "new") {
          const createdOrExistingId = prevAuto ?? createId;
          if (!createdOrExistingId) return;
          destId = createdOrExistingId;
        } else if (drop) {
          destId = drop.trackId;
        }

        const projection = projectVideoComposeClipDrag({
          state: snapshot,
          session: dragSession,
          destinationTrackId: destId,
          createdTrackId: createId,
          previousAutoCreatedTrackId: prevAuto,
          deltaMs: dxMs,
          pxPerMs: pxPerMsRef.current,
          snapEnabled: snapRef.current,
        });
        if (!projection) return;
        if (projection.status === "blocked") {
          setDragGhost(null);
          return;
        }
        setTimeline((previous) => ({
          ...previous,
          tracks: projection.timeline.tracks,
        }));
        if (projection.magnetic) {
          // 幽灵副本跟随指针（被抓取点不变）：原片段左缘 + 指针位移。
          const ghostLeftPx = Math.max(
            0,
            dragSession.originalTimelineStartMs * pxPerMsRef.current +
              (clientX - startX),
          );
          setDragGhost({
            clipId,
            trackId: projection.targetTrackId,
            ghostLeftPx,
          });
        } else {
          setDragGhost(null);
        }
        // 仅在「成功落地」后维护闭包：新建→记下；片段离开自动轨（被剪枝）→ 清空，
        // 避免下次拖「新行」复用已删除 id 导致片段丢失。currentTrackId 始终指向有效轨。
        autoCreatedTrackId = projection.autoCreatedTrackId;
        currentTrackId = projection.targetTrackId;
      };

      const onMove = (ev: PointerEvent) => {
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
        if (!moved) {
          moved = true;
          pushHistory();
        }
        latest = { x: ev.clientX, y: ev.clientY };
        if (!rafId) rafId = requestAnimationFrame(apply);
      };
      const end = () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        activeDragCleanupRef.current = null;
        setDragGhost(null); // 收起拖动投影/幽灵
        if (!moved) return;
        // 收尾：清掉所有变空的非默认轨道，并把选中跟到片段最终所在轨道。
        applyTimelineEdit({ type: "cleanupEmptyTracks" });
        selectOnly({ trackId: currentTrackId, clipId });
      };
      activeDragCleanupRef.current = end;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [
      applyTimelineEdit,
      pushHistory,
      resolveDropTrack,
      selectOnly,
      toggleInSelection,
    ],
  );

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
  //（见 VolumePopover 的 onGestureStart），否则一次拖动就把整个撤销栈冲掉。
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

  // ── trim drag ─────────────────────────────────────────────────────────────
  const startTrim = useCallback(
    (
      event: ReactPointerEvent,
      track: ComposeTrack,
      clip: ComposeClip,
      edge: "start" | "end",
    ) => {
      event.stopPropagation();
      event.preventDefault();
      if (activeDragCleanupRef.current) return; // 已有拖动在进行，忽略并发触发
      const trimSession = createVideoComposeTrimDragSession(
        timelineRef.current,
        { trackId: track.id, clipId: clip.id },
      );
      if (!trimSession) return;
      selectOnly({ trackId: track.id, clipId: clip.id });
      setTrimEdit({ clipId: clip.id, edge });
      pushHistory();
      const startX = event.clientX;
      const onMove = (ev: PointerEvent) => {
        const patch = projectVideoComposeTrimDrag(trimSession, {
          edge,
          deltaTimelineMs: (ev.clientX - startX) / pxPerMsRef.current,
          snapEnabled: snapRef.current,
        });
        applyTimelineEdit({
          type: "updateClip",
          target: trimSession.target,
          patch,
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        activeDragCleanupRef.current = null;
        setTrimEdit(null); // 收起裁剪时长气泡
        // 裁剪结束后视频轨 ripple 补位，把裁出来的缺口合拢。
        applyTimelineEdit({ type: "compactMainVideoTrack" });
      };
      activeDragCleanupRef.current = onUp;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [applyTimelineEdit, pushHistory, selectOnly],
  );

  // ── playhead seek / drag ──────────────────────────────────────────────────
  const seekFromClientX = useCallback(
    (clientX: number) => {
      const cont = trackScrollRef.current;
      if (!cont) return;
      const rect = cont.getBoundingClientRect();
      const x = clientX - rect.left + cont.scrollLeft;
      seek(
        snapVideoComposePlayhead({
          state: timelineRef.current,
          playheadMs: x / pxPerMsRef.current,
          pxPerMs: pxPerMsRef.current,
          enabled: snapRef.current,
        }),
      );
    },
    [seek],
  );

  // 统一的「按下即拖动 scrub」：用 setPointerCapture 把后续 move/up 都锁定到按下的
  // 元素上，并监听 pointercancel —— 旧实现挂的是 window 监听且只听 pointerup，一旦
  // pointercancel（触控板手势 / 指针被系统接管等）就漏掉清理，move 监听残留，于是
  // 鼠标在空白区移动也会带着时间针走。指针捕获 + cancel 兜底彻底消除这个泄漏。
  const startScrub = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (activeDragCleanupRef.current) return; // 已有拖动在进行，忽略并发触发
      const el = event.currentTarget as HTMLElement;
      const pointerId = event.pointerId;
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      seekFromClientX(event.clientX);
      // 把高频 pointermove 合并到每帧一次：拖动时只记录最新 X，rAF 里处理一次。
      // 避免一次拖动甩出几十上百个 seek + setState 把主线程塞满（进而饿死解码/绘制，
      // 表现为预览画面卡顿）。
      let latestX = event.clientX;
      let rafId = 0;
      const pump = () => {
        rafId = 0;
        seekFromClientX(latestX);
      };
      const onMove = (ev: PointerEvent) => {
        latestX = ev.clientX;
        if (!rafId) rafId = requestAnimationFrame(pump);
      };
      const end = () => {
        if (rafId) cancelAnimationFrame(rafId);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        activeDragCleanupRef.current = null;
        seekFromClientX(latestX); // 落点精确对齐最后位置
      };
      activeDragCleanupRef.current = end;
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    },
    [seekFromClientX],
  );

  // ── zoom ───────────────────────────────────────────────────────────────────
  const zoomIn = useCallback(
    () => setPxPerSec((v) => clamp(v * ZOOM_STEP, MIN_PX_PER_SEC, MAX_PX_PER_SEC)),
    [],
  );
  const zoomOut = useCallback(
    () => setPxPerSec((v) => clamp(v / ZOOM_STEP, MIN_PX_PER_SEC, MAX_PX_PER_SEC)),
    [],
  );

  // Close on Escape (unless a popover/export is busy).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (coverEditorOpen) setCoverEditorOpen(false);
      else if (exportMenuOpen) setExportMenuOpen(false);
      else if (speedOpen) setSpeedOpen(false);
      else if (volumeOpen) setVolumeOpen(false);
      else if (!isExporting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coverEditorOpen, exportMenuOpen, isExporting, onClose, speedOpen, volumeOpen]);

  // 编辑快捷键：空格 播放/暂停、Delete 删片段、⌘Z/⇧⌘Z 撤销重做、⌘C/⌘V/⌘D 复制粘贴副本、
  // ←/→ 微移播放头（按 1 帧，Shift 为 1 秒）。焦点在输入框 / 导出弹窗打开时不拦截。
  useEffect(() => {
    const FRAME_MS = 1000 / 30;
    const isTyping = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        node.isContentEditable
      );
    };
    const onKey = (event: KeyboardEvent) => {
      if (isExporting || exportDialog.open || coverEditorOpen || isTyping(event.target))
        return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;

      if (mod && (key === "z" || key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (key === "y" || key === "Y")) {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && (key === "c" || key === "C")) {
        event.preventDefault();
        copySelected();
        return;
      }
      if (mod && (key === "v" || key === "V")) {
        event.preventDefault();
        pasteClipboard();
        return;
      }
      if (mod && (key === "d" || key === "D")) {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod) return; // 其余带修饰键的组合交给浏览器/系统

      if (key === " " || key === "Spacebar") {
        event.preventDefault();
        toggle();
        return;
      }
      if (key === "Delete" || key === "Backspace") {
        event.preventDefault();
        removeSelected();
        return;
      }
      if (key === "ArrowLeft" || key === "ArrowRight") {
        event.preventDefault();
        const step = (event.shiftKey ? 1000 : FRAME_MS) * (key === "ArrowLeft" ? -1 : 1);
        seek(clamp(playheadRef.current + step, 0, durationMs));
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    copySelected,
    coverEditorOpen,
    duplicateSelected,
    durationMs,
    exportDialog.open,
    isExporting,
    pasteClipboard,
    redo,
    removeSelected,
    seek,
    toggle,
    undo,
  ]);

  const rulerSeconds = Math.max(RULER_MIN_SECONDS, Math.ceil(durationMs / 1000));
  const timelineWidthPx = rulerSeconds * pxPerSec;
  const canExport = hasExportableClips(timeline) && !isExporting;
  // 时间轴上重叠的视频片段 id —— 用于把冲突片段高亮（红框）提示用户。
  const overlapClipIds = useMemo(() => overlappingVideoClipIds(timeline), [timeline]);

  const videoActive = useMemo(
    () => (videoTrack ? activeClipAt(videoTrack, playheadMs) : null),
    [videoTrack, playheadMs],
  );
  // 媒体主时钟用：把当前激活视频片段的时间线/裁剪/变速映射喂给 mediaClockMs。
  activeVideoRef.current = videoActive
    ? {
        clipId: videoActive.laid.clip.id,
        timelineStartMs: videoActive.laid.timelineStartMs,
        timelineEndMs: videoActive.laid.timelineEndMs,
        trimStartMs: videoActive.laid.clip.trimStartMs,
        speed: videoActive.laid.clip.speed > 0 ? videoActive.laid.clip.speed : 1,
      }
    : null;
  const videoSource = useMemo(
    () => (videoActive ? resolveImageDisplayUrl(videoActive.laid.clip.sourceUrl) : null),
    [videoActive],
  );

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
              这里跟 SpeedPopover 一样用模态内的相对定位浮层，避开 z 冲突。 */}
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
          <ToolButton icon={Undo2} label={t("videoCompose.undo")} disabled={past.length === 0} onClick={undo} />
          <ToolButton icon={Redo2} label={t("videoCompose.redo")} disabled={future.length === 0} onClick={redo} />
          <ToolDivider />
          <ToolButton icon={Split} label={t("videoCompose.split")} disabled={!canSplitInside} onClick={splitSelected} />
          <ToolButton
            icon={ArrowLeftToLine}
            label={t("videoCompose.splitLeft")}
            disabled={!canSplitInside}
            onClick={() => trimSelectedToPlayhead("left")}
          />
          <ToolButton
            icon={ArrowRightToLine}
            label={t("videoCompose.splitRight")}
            disabled={!canSplitInside}
            onClick={() => trimSelectedToPlayhead("right")}
          />
          <div className="relative">
            <ToolButton
              icon={Gauge}
              label={t("videoCompose.speed")}
              disabled={!selectedClip}
              active={speedOpen}
              onClick={() => setSpeedOpen((open) => !open)}
            />
            {speedOpen && selectedClip && (
              <SpeedPopover
                speed={selectedSpeed}
                sourceSpanMs={selectedSourceSpanMs}
                onChange={setSelectedSpeed}
                onClose={() => setSpeedOpen(false)}
              />
            )}
          </div>
          <div className="relative">
            <ToolButton
              icon={selectedMuted || selectedVolume <= 0 ? VolumeX : Volume2}
              label={t("videoCompose.volume")}
              disabled={!selectedClip}
              active={volumeOpen}
              onClick={() => setVolumeOpen((open) => !open)}
            />
            {volumeOpen && selectedClip && (
              <VolumePopover
                volume={selectedVolume}
                muted={selectedMuted}
                onChange={setSelectedVolume}
                onGestureStart={pushHistory}
                onToggleMute={toggleSelectedMute}
                onClose={() => setVolumeOpen(false)}
              />
            )}
          </div>
          <ToolButton
            icon={Copy}
            label={t("videoCompose.duplicate")}
            disabled={!selectedClip}
            onClick={duplicateSelected}
          />
          <ToolButton
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
          <ToolButton
            icon={RotateCcw}
            label={t("videoCompose.resetToUpstream")}
            onClick={resetToUpstream}
          />
          <ToolDivider />
          <ToolButton
            icon={Magnet}
            label={t("videoCompose.snap")}
            active={snapEnabled}
            onClick={() => setSnapEnabled((v) => !v)}
          />
          <ToolDivider />
          <ToolButton icon={ZoomOutGlyph} label={t("videoCompose.zoomOut")} disabled={pxPerSec <= MIN_PX_PER_SEC} onClick={zoomOut} />
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
          <ToolButton icon={ZoomInGlyph} label={t("videoCompose.zoomIn")} disabled={pxPerSec >= MAX_PX_PER_SEC} onClick={zoomIn} />
          <ToolDivider />
          <ToolButton
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
                <TrackRow
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

            {/* Playhead (draggable) —— 位置由 positionPlayhead 命令式写 transform，
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

// Wrap zoom icons so ToolButton's `icon` typing stays a single component type.
function ZoomInGlyph(props: { className?: string }) {
  return <Plus {...props} />;
}
function ZoomOutGlyph(props: { className?: string }) {
  return <Minus {...props} />;
}

function ToolDivider() {
  return <div className="mx-1 h-5 w-px bg-border-dark" />;
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? "bg-primary/20 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Stepper({
  value,
  onStep,
}: {
  value: string;
  onStep: (dir: 1 | -1) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1">
      <span className="min-w-[48px] text-right font-mono text-xs tabular-nums text-text-dark">
        {value}
      </span>
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onStep(1)}
          className="text-text-muted transition-colors hover:text-text-dark"
          aria-label="+"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onStep(-1)}
          className="text-text-muted transition-colors hover:text-text-dark"
          aria-label="−"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/**
 * 变速 popover —— 倍数 / 时长 双向联动。倍速是唯一真值,时长 = 源裁剪长度 / 倍速,
 * 反过来调时长则 倍速 = 源长 / 时长。两个值都可拖滑块或点上下步进。
 */
function SpeedPopover({
  speed,
  sourceSpanMs: span,
  onChange,
  onClose,
}: {
  speed: number;
  sourceSpanMs: number;
  onChange: (speed: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const safeSpan = span > 0 ? span : 1;
  const lengthMs = safeSpan / (speed > 0 ? speed : 1);
  // speed ∈ [MIN,MAX] ⇒ length ∈ [span/MAX, span/MIN].
  const minLen = safeSpan / VIDEO_COMPOSE_MAX_SPEED;
  const maxLen = safeSpan / VIDEO_COMPOSE_MIN_SPEED;

  const setSpeed = (next: number) =>
    onChange(
      clamp(
        Math.round(next * 100) / 100,
        VIDEO_COMPOSE_MIN_SPEED,
        VIDEO_COMPOSE_MAX_SPEED,
      ),
    );
  const setLength = (nextMs: number) => {
    const len = clamp(nextMs, minLen, maxLen);
    onChange(
      clamp(
        safeSpan / len,
        VIDEO_COMPOSE_MIN_SPEED,
        VIDEO_COMPOSE_MAX_SPEED,
      ),
    );
  };

  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 w-80 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text-dark">
          {t("videoCompose.speed")}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-text-muted hover:text-text-dark"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 倍数 */}
      <div className="mb-3">
        <div className="mb-1 text-xs text-text-muted">
          {t("videoCompose.speedMultiplier")}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={VIDEO_COMPOSE_MIN_SPEED}
            max={VIDEO_COMPOSE_MAX_SPEED}
            step={0.01}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            list="video-compose-speed-ticks"
            className="h-1 flex-1 cursor-pointer accent-primary"
          />
          <datalist id="video-compose-speed-ticks">
            <option value="0.5" />
            <option value="1" />
            <option value="2" />
            <option value="3" />
            <option value="4" />
          </datalist>
          <Stepper
            value={`${speed.toFixed(2)}x`}
            onStep={(dir) => setSpeed(speed + dir * 0.05)}
          />
        </div>
      </div>

      {/* 时长 */}
      <div>
        <div className="mb-1 text-xs text-text-muted">
          {t("videoCompose.duration")}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={minLen}
            max={maxLen}
            step={10}
            value={lengthMs}
            onChange={(e) => setLength(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-primary"
          />
          <Stepper
            value={`${(lengthMs / 1000).toFixed(1)}s`}
            onStep={(dir) => setLength(lengthMs + dir * 100)}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 音量 popover —— 0~100% 滑杆 + 一键静音。音量为 0 即静音；拖动滑杆离开 0 自动取消静音。
 */
function VolumePopover({
  volume,
  muted,
  onChange,
  onGestureStart,
  onToggleMute,
  onClose,
}: {
  volume: number;
  muted: boolean;
  onChange: (volume: number) => void;
  /** 一次调节手势开始（指针按下 / 单次按键）时调用 —— 宿主借此只 push 一次历史。 */
  onGestureStart: () => void;
  onToggleMute: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const effective = muted ? 0 : volume;
  const percent = Math.round(effective * 100);
  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text-dark">
          {t("videoCompose.volume")}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-text-muted hover:text-text-dark"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMute}
          className="shrink-0 rounded p-1 text-text-muted transition-colors hover:text-text-dark"
          aria-label={muted ? t("videoCompose.unmute") : t("videoCompose.mute")}
          title={muted ? t("videoCompose.unmute") : t("videoCompose.mute")}
        >
          {muted || volume <= 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={effective}
          onPointerDown={onGestureStart}
          onKeyDown={(e) => {
            // 键盘步进：每次独立按键算一个手势（按住连发只记一次）。
            if (!e.repeat && e.key.startsWith("Arrow")) onGestureStart();
          }}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-primary"
        />
        <span className="min-w-[40px] text-right font-mono text-xs tabular-nums text-text-dark">
          {percent}%
        </span>
      </div>
    </div>
  );
}

/**
 * Tile sampled video frames across a clip's displayed width, windowed to its
 * trim range — the libtv-style filmstrip. Frames are captured once per source
 * and cached, so trimming only re-picks frames (no re-capture).
 */
// libtv 风格「加载中」占位：斜纹底 + 左侧标签。缩略图 / 媒体未就绪时铺在片段上。
function ClipLoadingStripe({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 flex items-center overflow-hidden"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.11) 8px, rgba(255,255,255,0.11) 16px)",
      }}
    >
      <span className="truncate px-2 text-[10px] text-media-foreground/70">{label}</span>
    </div>
  );
}

function ClipFilmstrip({
  sourceUrl,
  trimStartMs,
  trimEndMs,
  width,
}: {
  sourceUrl: string;
  trimStartMs: number;
  trimEndMs: number;
  width: number;
}) {
  const { t } = useTranslation();
  const [frames, setFrames] = useState<FilmstripFrame[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFilmstrip(sourceUrl)
      .then((result) => {
        if (!cancelled) {
          setFrames(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  // 缩略图还在抓取时，铺一层 libtv 风格的斜纹 + 「视频加载中…」占位。
  if (frames.length === 0) {
    return loading ? <ClipLoadingStripe label={t("videoCompose.clipLoading")} /> : null;
  }
  const len = Math.max(1, trimEndMs - trimStartMs);
  const slots = Math.max(1, Math.ceil(width / FILMSTRIP_THUMB_W));
  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {Array.from({ length: slots }, (_, i) => {
        const center = trimStartMs + ((i + 0.5) / slots) * len;
        const frame = pickFrame(frames, center);
        return (
          <div
            key={i}
            className="h-full shrink-0 border-r border-media/20 last:border-r-0"
            style={{ width: FILMSTRIP_THUMB_W }}
          >
            {frame && (
              <img
                src={frame.url}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 音频片段波形 —— 解码源音频峰值并按裁剪窗口绘制到 canvas，随片段宽度/裁剪实时重绘。
 * 峰值带模块级缓存，同一 src 只解码一次。解码完成前铺底色（外层渐变）兜底。
 */
function ClipWaveform({
  sourceUrl,
  trimStartMs,
  trimEndMs,
  width,
}: {
  sourceUrl: string;
  trimStartMs: number;
  trimEndMs: number;
  width: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(() =>
    getCachedAudioPeaks(sourceUrl),
  );

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedAudioPeaks(sourceUrl);
    if (cached) {
      setPeaks(cached);
      return;
    }
    setPeaks(null);
    loadAudioPeaks(sourceUrl)
      .then((p) => {
        if (!cancelled) setPeaks(p);
      })
      .catch(() => {
        // 解码失败（CORS / 格式不支持）→ 保持底色，不画波形。
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const h = canvas.clientHeight || 64;
    const w = Math.max(1, Math.round(width));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const startBucket = (trimStartMs / 1000) * PEAK_BUCKETS_PER_SEC;
    const endBucket = (trimEndMs / 1000) * PEAK_BUCKETS_PER_SEC;
    const span = Math.max(1, endBucket - startBucket);
    const mid = h / 2;
    const maxBar = h * 0.42;
    ctx.fillStyle = "rgba(56, 189, 248, 0.85)";
    for (let x = 0; x < w; x += 1) {
      const b0 = startBucket + (x / w) * span;
      const b1 = startBucket + ((x + 1) / w) * span;
      let peak = 0;
      for (let b = Math.floor(b0); b < Math.max(Math.floor(b0) + 1, Math.ceil(b1)); b += 1) {
        const v = peaks[b] ?? 0;
        if (v > peak) peak = v;
      }
      const bar = Math.max(1, peak * maxBar);
      ctx.fillRect(x, mid - bar, 1, bar * 2);
    }
  }, [peaks, trimStartMs, trimEndMs, width]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

function TrackRow({
  track,
  pxPerMs,
  selectedClipId,
  selectedIds,
  overlapClipIds,
  draggingClipId,
  ghostLeftPx,
  trimmingClipId,
  trimEdge,
  onStartClipMove,
  onTrim,
  onMoveToNewTrack,
  onRemove,
  onToggleMute,
}: {
  track: ComposeTrack;
  pxPerMs: number;
  selectedClipId: string | null;
  /** 全部选中片段 id（高亮用）；多选时含多个。 */
  selectedIds: ReadonlySet<string>;
  overlapClipIds: ReadonlySet<string>;
  /** 正在被拖动的片段 id（用于在落点画半透明投影）。 */
  draggingClipId: string | null;
  /** 跟随指针的幽灵副本左缘（px）；仅当被拖片段在本轨时非 null。 */
  ghostLeftPx: number | null;
  /** 正在裁剪的片段 id（用于在其边缘浮裁剪后时长气泡）。 */
  trimmingClipId: string | null;
  /** 正在裁剪的边（start=左 / end=右），决定气泡贴哪一侧。 */
  trimEdge: "start" | "end" | null;
  onStartClipMove: (
    event: ReactPointerEvent,
    track: ComposeTrack,
    clip: ComposeClip,
  ) => void;
  onTrim: (
    event: ReactPointerEvent,
    track: ComposeTrack,
    clip: ComposeClip,
    edge: "start" | "end",
  ) => void;
  onMoveToNewTrack: (trackId: string, clipId: string) => void;
  onRemove: (trackId: string, clipId: string) => void;
  onToggleMute: (clipId: string, muted: boolean) => void;
}) {
  const { t } = useTranslation();
  const laid = layoutTrack(track);
  const Icon = track.kind === "video" ? VideoIcon : Music;
  // 跟随指针浮起的幽灵副本对应的片段（仅当被拖片段落在本轨时）。
  const ghostClip =
    ghostLeftPx != null && draggingClipId
      ? track.clips.find((c) => c.id === draggingClipId) ?? null
      : null;
  // 拖动时落点槽位的起点（ms）—— 气泡显示「将落在 mm:ss」。
  const ghostStartMs = ghostClip
    ? laid.find((l) => l.clip.id === draggingClipId)?.timelineStartMs ?? 0
    : 0;
  // 正在裁剪的片段（在其边缘浮「裁剪后时长」气泡）。
  const trimLaid = trimmingClipId
    ? laid.find((l) => l.clip.id === trimmingClipId) ?? null
    : null;
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-6 shrink-0 justify-center text-text-muted">
        <Icon className="h-4 w-4" />
      </div>
      <div
        className="relative h-16 flex-1"
        data-compose-track-id={track.id}
        data-compose-track-kind={track.kind}
      >
        {laid.length === 0 && (
          <div className="flex h-full items-center rounded-md border border-dashed border-border bg-muted px-3 text-[11px] text-muted-foreground">
            {t("videoCompose.trackEmpty")}
          </div>
        )}
        {laid.map(({ clip, timelineStartMs }) => {
          const width = Math.max(24, clipLengthMs(clip) * pxPerMs);
          const isPrimary = clip.id === selectedClipId;
          const isSelected = isPrimary || selectedIds.has(clip.id);
          const isOverlapping = overlapClipIds.has(clip.id);
          // 被拖片段：在它将落入的槽位画一道半透明青色「投影」，幽灵副本另在下方跟指针浮起。
          const isDragging = clip.id === draggingClipId;
          return (
            <div
              key={clip.id}
              onPointerDown={(event) => onStartClipMove(event, track, clip)}
              title={isOverlapping ? t("videoCompose.error.overlap") : undefined}
              className={`absolute top-0 h-16 cursor-grab overflow-hidden rounded-md border bg-media transition-[opacity] active:cursor-grabbing ${
                isDragging
                  ? "border-dashed border-primary/80 bg-primary/10 opacity-40"
                  : isOverlapping
                    ? "border-destructive ring-2 ring-destructive/70"
                    : isSelected
                      ? // 多选都描白边；主选中（驱动编辑面板）描得更亮一点。
                        `border-media-foreground ring-2 ${isPrimary ? "ring-media-foreground" : "ring-media-foreground/60"}`
                      : "border-border-dark"
              }`}
              style={{ left: timelineStartMs * pxPerMs, width }}
            >
              {/* Background: filmstrip for video clips, gradient fallback. */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/25 to-primary/5" />
              {track.kind === "video" && (
                <ClipFilmstrip
                  sourceUrl={clip.sourceUrl}
                  trimStartMs={clip.trimStartMs}
                  trimEndMs={clip.trimEndMs}
                  width={width}
                />
              )}
              {track.kind === "audio" && (
                <ClipWaveform
                  sourceUrl={clip.sourceUrl}
                  trimStartMs={clip.trimStartMs}
                  trimEndMs={clip.trimEndMs}
                  width={width}
                />
              )}
              {/* Scrim so overlaid chips stay legible over bright frames. */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-media/45 via-transparent to-media/30" />
              <div className="absolute inset-0 flex flex-col justify-between p-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate rounded bg-media/50 px-1 text-[10px] text-media-foreground">
                    {clip.speed !== 1
                      ? `${t("videoCompose.speedPrefix")} ${clip.speed.toFixed(2)}X `
                      : ""}
                    {clip.displayName || t(`videoCompose.kind.${track.kind}`)}
                    {" "}
                    {formatTimecode(clipLengthMs(clip))}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {/* 视频和音频片段都可单独静音（视频静的是它自带的声轨）。 */}
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onToggleMute(clip.id, !clip.muted)}
                      className="rounded bg-media/50 p-0.5 text-media-foreground/80 hover:text-media-foreground"
                      aria-label={clip.muted ? t("videoCompose.unmute") : t("videoCompose.mute")}
                    >
                      {clip.muted ? (
                        <VolumeX className="h-3 w-3" />
                      ) : (
                        <Volume2 className="h-3 w-3" />
                      )}
                    </button>
                    {/* 移到新的一行（新建同种类轨道） */}
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onMoveToNewTrack(track.id, clip.id)}
                      className="rounded bg-media/50 p-0.5 text-media-foreground/80 hover:text-media-foreground"
                      aria-label={t("videoCompose.moveToNewTrack")}
                      title={t("videoCompose.moveToNewTrack")}
                    >
                      <Rows3 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onRemove(track.id, clip.id)}
                      className="rounded bg-media/50 p-0.5 text-media-foreground/80 hover:text-destructive"
                      aria-label={t("videoCompose.removeClip")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span className="rounded bg-media/50 px-1 text-[10px] tabular-nums text-media-foreground/80">
                    {(clipLengthMs(clip) / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
              {/* Trim handles — invisible hit areas, faint hint on hover only. */}
              <div
                className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-transparent transition-colors hover:bg-media-foreground/30"
                onPointerDown={(e) => onTrim(e, track, clip, "start")}
              />
              <div
                className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-transparent transition-colors hover:bg-media-foreground/30"
                onPointerDown={(e) => onTrim(e, track, clip, "end")}
              />
            </div>
          );
        })}

        {/* 拖动幽灵副本：跟随指针浮起（轻微抬升 + 阴影 + 高亮描边），与落点的青色投影呼应，
            清晰表达「这段正在被拖动」。纯展示，pointer-events 全关，不参与命中。 */}
        {ghostClip && ghostLeftPx != null && (
          <div
            className="pointer-events-none absolute top-0 z-30 h-16 -translate-y-1.5 overflow-hidden rounded-md border border-media-foreground/90 bg-media opacity-95 shadow-xl ring-2 ring-primary/60"
            style={{
              left: ghostLeftPx,
              width: Math.max(24, clipLengthMs(ghostClip) * pxPerMs),
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/25 to-primary/5" />
            {track.kind === "video" && (
              <ClipFilmstrip
                sourceUrl={ghostClip.sourceUrl}
                trimStartMs={ghostClip.trimStartMs}
                trimEndMs={ghostClip.trimEndMs}
                width={Math.max(24, clipLengthMs(ghostClip) * pxPerMs)}
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-media/45 via-transparent to-media/30" />
            <div className="absolute inset-x-1 top-1">
              <span className="truncate rounded bg-media/55 px-1 text-[10px] text-media-foreground">
                {ghostClip.displayName || t(`videoCompose.kind.${track.kind}`)}
                {" "}
                {formatTimecode(clipLengthMs(ghostClip))}
              </span>
            </div>
          </div>
        )}

        {/* 拖动时间气泡：落点起始时间码，跟着幽灵副本走。 */}
        {ghostClip && ghostLeftPx != null && (
          <div
            className="pointer-events-none absolute top-0 z-40 -translate-y-[18px] rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-primary-foreground shadow"
            style={{ left: ghostLeftPx }}
          >
            {formatTimecode(ghostStartMs)}
          </div>
        )}

        {/* 裁剪时长气泡：贴在被裁边缘，实时显示裁剪后的片段时长。 */}
        {trimLaid && (
          <div
            className="pointer-events-none absolute top-0 z-40 rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-primary-foreground shadow"
            style={{
              left:
                trimEdge === "end"
                  ? trimLaid.timelineEndMs * pxPerMs
                  : trimLaid.timelineStartMs * pxPerMs,
              transform:
                trimEdge === "end"
                  ? "translate(-100%, -18px)"
                  : "translate(0, -18px)",
            }}
          >
            {formatTimecode(clipLengthMs(trimLaid.clip))}
          </div>
        )}
      </div>
    </div>
  );
}
