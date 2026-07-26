// Copyright (c) 2026 AI anime
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Check, Loader2, Repeat, Type as TypeIcon, VolumeX, X } from 'lucide-react';

import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import type { CaptureVideoFrameStrip } from '@/features/canvas/application/videoFrameStrip';
import { CANVAS_NODE_OPS_PANEL_CLASS } from '@/features/canvas/ui/nodeFrameStyles';

interface VideoClipPanelProps {
  videoUrl: string;
  durationMs: number | null | undefined;
  clipStartMs: number | null | undefined;
  clipEndMs: number | null | undefined;
  isSubmitting?: boolean;
  captureFrameStrip: CaptureVideoFrameStrip;
  onChange: (patch: { clipStartMs?: number | null; clipEndMs?: number | null }) => void;
  onExit: () => void;
  onSubmit: (start: number, end: number) => void;
}

const THUMB_COUNT = 8;
const MIN_CLIP_MS = 200;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  if (seconds >= 10) return `${seconds.toFixed(1)} s`;
  return `${seconds.toFixed(2)} s`;
}

type DragMode = 'start' | 'end' | null;

export const VideoClipPanel = memo(function VideoClipPanel({
  videoUrl,
  durationMs,
  clipStartMs,
  clipEndMs,
  isSubmitting = false,
  captureFrameStrip,
  onChange,
  onExit,
  onSubmit,
}: VideoClipPanelProps) {
  const totalMs = useMemo(() => {
    if (typeof durationMs === 'number' && durationMs > 0) return durationMs;
    return null;
  }, [durationMs]);

  const startMs = useMemo(() => {
    if (typeof clipStartMs === 'number') return clamp(clipStartMs, 0, totalMs ?? clipStartMs);
    return 0;
  }, [clipStartMs, totalMs]);

  const endMs = useMemo(() => {
    if (typeof clipEndMs === 'number') return clamp(clipEndMs, 0, totalMs ?? clipEndMs);
    return totalMs ?? 0;
  }, [clipEndMs, totalMs]);

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [thumbsState, setThumbsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    setThumbs([]);
    setThumbsState('loading');
    const resolved = resolveImageDisplayUrl(videoUrl);
    if (!resolved) {
      setThumbsState('error');
      return;
    }
    void captureFrameStrip(resolved, {
      count: THUMB_COUNT,
      targetWidth: 160,
    })
      .then((frames) => {
        if (cancelled) return;
        setThumbs(frames.map((frame) => frame.url));
        setThumbsState('ready');
      })
      .catch((error) => {
        console.warn('[video-clip] thumbnail extraction failed', error);
        if (!cancelled) setThumbsState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [captureFrameStrip, videoUrl]);

  const setStart = useCallback(
    (nextStart: number) => {
      if (!totalMs) return;
      const clamped = clamp(nextStart, 0, Math.max(0, endMs - MIN_CLIP_MS));
      onChange({ clipStartMs: clamped });
    },
    [endMs, onChange, totalMs],
  );

  const setEnd = useCallback(
    (nextEnd: number) => {
      if (!totalMs) return;
      const clamped = clamp(nextEnd, startMs + MIN_CLIP_MS, totalMs);
      onChange({ clipEndMs: clamped });
    },
    [onChange, startMs, totalMs],
  );

  useEffect(() => {
    if (!dragMode || !totalMs) return;
    const track = trackRef.current;
    if (!track) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      const ratio = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
      const ms = Math.round(ratio * totalMs);
      if (dragMode === 'start') setStart(ms);
      else if (dragMode === 'end') setEnd(ms);
    };

    const handlePointerUp = () => setDragMode(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragMode, setEnd, setStart, totalMs]);

  const startPct = totalMs ? (startMs / totalMs) * 100 : 0;
  const endPct = totalMs ? (endMs / totalMs) * 100 : 100;
  const selectionMs = Math.max(0, endMs - startMs);

  const handleSubmit = useCallback(() => {
    if (!totalMs || isSubmitting) return;
    onSubmit(startMs, endMs);
  }, [endMs, isSubmitting, onSubmit, startMs, totalMs]);

  const startDrag = useCallback(
    (mode: DragMode) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isSubmitting) return;
      event.preventDefault();
      event.stopPropagation();
      setDragMode(mode);
    },
    [isSubmitting],
  );

  return (
    <div
      className={`nodrag flex w-full items-center gap-2 rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS} p-2`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
        onClick={onExit}
        disabled={isSubmitting}
        title="退出剪辑"
      >
        <X className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-dark/72"
        title="字幕（待实现）"
        disabled
      >
        <TypeIcon className="h-4 w-4" />
      </button>

      <div
        ref={trackRef}
        className="relative h-14 flex-1 select-none overflow-hidden rounded-md bg-media"
      >
        {/* thumbnail strip */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: THUMB_COUNT }).map((_, index) => (
            <div
              key={index}
              className="h-full flex-1 bg-media"
              style={{
                backgroundImage: thumbs[index] ? `url(${thumbs[index]})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          ))}
        </div>

        {thumbsState === 'loading' && thumbs.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-media-foreground/65">
            提取画面帧中…
          </div>
        )}
        {thumbsState === 'error' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-media-foreground/65">
            画面帧加载失败
          </div>
        )}

        {/* dark mask outside the selection */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-media/55"
          style={{ width: `${startPct}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-media/55"
          style={{ width: `${100 - endPct}%` }}
        />

        {/* selection rectangle (top/bottom borders + inner handles) */}
        <div
          className="absolute inset-y-0 z-10 border-y-2 border-media-foreground"
          style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
        >
          <div
            className="absolute inset-y-0 left-0 flex w-3 cursor-ew-resize items-center justify-center rounded-l-md bg-media-foreground"
            onPointerDown={startDrag('start')}
            title="拖动以调整起点"
          >
            <div className="h-4 w-[2px] rounded-full bg-media/40" />
          </div>
          <div
            className="absolute inset-y-0 right-0 flex w-3 cursor-ew-resize items-center justify-center rounded-r-md bg-media-foreground"
            onPointerDown={startDrag('end')}
            title="拖动以调整终点"
          >
            <div className="h-4 w-[2px] rounded-full bg-media/40" />
          </div>
        </div>

        {/* duration chip */}
        <div
          className="pointer-events-none absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-md bg-media/65 px-1.5 py-0.5 text-[11px] font-medium text-media-foreground"
          style={{ left: `calc((${startPct}% + ${endPct}%) / 2)` }}
        >
          {formatSeconds(selectionMs)}
        </div>
      </div>

      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-dark/72"
        title="静音（待实现）"
        disabled
      >
        <VolumeX className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-dark/72"
        title="循环（待实现）"
        disabled
      >
        <Repeat className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        onClick={handleSubmit}
        disabled={!totalMs || selectionMs < MIN_CLIP_MS || isSubmitting}
        title={isSubmitting ? '剪辑中…' : '提交剪辑'}
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
      </button>
    </div>
  );
});
