// Copyright (c) 2026 AI anime
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Music,
  Rows3,
  Trash2,
  Video as VideoIcon,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  clipLengthMs,
  layoutTrack,
  type ComposeClip,
  type ComposeTrack,
} from "@/modules/creative_canvas/public";
import {
  getCachedAudioPeaks,
  loadAudioPeaks,
  PEAK_BUCKETS_PER_SEC,
} from "@/features/canvas/compose/audioPeaks";
import {
  getFilmstrip,
  pickFrame,
  type FilmstripFrame,
} from "@/features/canvas/compose/filmstrip";

const FILMSTRIP_THUMB_WIDTH = 72;

function formatTimecode(ms: number, fps = 30): string {
  const totalMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const frame = Math.min(
    fps - 1,
    Math.floor(((totalMs % 1000) / 1000) * fps),
  );
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frame)}`;
}

function VideoComposeClipLoadingStripe({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 flex items-center overflow-hidden"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.11) 8px, rgba(255,255,255,0.11) 16px)",
      }}
    >
      <span className="truncate px-2 text-[10px] text-media-foreground/70">
        {label}
      </span>
    </div>
  );
}

function VideoComposeClipFilmstrip({
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

  if (frames.length === 0) {
    return loading ? (
      <VideoComposeClipLoadingStripe
        label={t("videoCompose.clipLoading")}
      />
    ) : null;
  }
  const lengthMs = Math.max(1, trimEndMs - trimStartMs);
  const slots = Math.max(1, Math.ceil(width / FILMSTRIP_THUMB_WIDTH));
  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {Array.from({ length: slots }, (_, index) => {
        const centerMs = trimStartMs + ((index + 0.5) / slots) * lengthMs;
        const frame = pickFrame(frames, centerMs);
        return (
          <div
            key={index}
            className="h-full shrink-0 border-r border-media/20 last:border-r-0"
            style={{ width: FILMSTRIP_THUMB_WIDTH }}
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

function VideoComposeClipWaveform({
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
      .then((result) => {
        if (!cancelled) setPeaks(result);
      })
      .catch(() => {
        // Unsupported media keeps the gradient fallback without a waveform.
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0) return;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const height = canvas.clientHeight || 64;
    const canvasWidth = Math.max(1, Math.round(width));
    canvas.width = Math.round(canvasWidth * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, canvasWidth, height);

    const startBucket = (trimStartMs / 1000) * PEAK_BUCKETS_PER_SEC;
    const endBucket = (trimEndMs / 1000) * PEAK_BUCKETS_PER_SEC;
    const bucketSpan = Math.max(1, endBucket - startBucket);
    const middle = height / 2;
    const maximumBarHeight = height * 0.42;
    context.fillStyle = "rgba(56, 189, 248, 0.85)";
    for (let x = 0; x < canvasWidth; x += 1) {
      const firstBucket = startBucket + (x / canvasWidth) * bucketSpan;
      const lastBucket =
        startBucket + ((x + 1) / canvasWidth) * bucketSpan;
      let peak = 0;
      for (
        let bucket = Math.floor(firstBucket);
        bucket <
        Math.max(Math.floor(firstBucket) + 1, Math.ceil(lastBucket));
        bucket += 1
      ) {
        const value = peaks[bucket] ?? 0;
        if (value > peak) peak = value;
      }
      const barHeight = Math.max(1, peak * maximumBarHeight);
      context.fillRect(x, middle - barHeight, 1, barHeight * 2);
    }
  }, [peaks, trimStartMs, trimEndMs, width]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

export interface VideoComposeTrackRowProps {
  track: ComposeTrack;
  pxPerMs: number;
  selectedClipId: string | null;
  selectedIds: ReadonlySet<string>;
  overlapClipIds: ReadonlySet<string>;
  draggingClipId: string | null;
  ghostLeftPx: number | null;
  trimmingClipId: string | null;
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
}

export function VideoComposeTrackRow({
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
}: VideoComposeTrackRowProps) {
  const { t } = useTranslation();
  const laidClips = layoutTrack(track);
  const Icon = track.kind === "video" ? VideoIcon : Music;
  const ghostClip =
    ghostLeftPx != null && draggingClipId
      ? track.clips.find((clip) => clip.id === draggingClipId) ?? null
      : null;
  const ghostStartMs = ghostClip
    ? laidClips.find((laid) => laid.clip.id === draggingClipId)
        ?.timelineStartMs ?? 0
    : 0;
  const trimmingClip = trimmingClipId
    ? laidClips.find((laid) => laid.clip.id === trimmingClipId) ?? null
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
        {laidClips.length === 0 && (
          <div className="flex h-full items-center rounded-md border border-dashed border-border bg-muted px-3 text-[11px] text-muted-foreground">
            {t("videoCompose.trackEmpty")}
          </div>
        )}
        {laidClips.map(({ clip, timelineStartMs }) => {
          const width = Math.max(24, clipLengthMs(clip) * pxPerMs);
          const isPrimary = clip.id === selectedClipId;
          const isSelected = isPrimary || selectedIds.has(clip.id);
          const isOverlapping = overlapClipIds.has(clip.id);
          const isDragging = clip.id === draggingClipId;
          return (
            <div
              key={clip.id}
              onPointerDown={(event) => onStartClipMove(event, track, clip)}
              title={
                isOverlapping ? t("videoCompose.error.overlap") : undefined
              }
              className={`absolute top-0 h-16 cursor-grab overflow-hidden rounded-md border bg-media transition-[opacity] active:cursor-grabbing ${
                isDragging
                  ? "border-dashed border-primary/80 bg-primary/10 opacity-40"
                  : isOverlapping
                    ? "border-destructive ring-2 ring-destructive/70"
                    : isSelected
                      ? `border-media-foreground ring-2 ${isPrimary ? "ring-media-foreground" : "ring-media-foreground/60"}`
                      : "border-border-dark"
              }`}
              style={{ left: timelineStartMs * pxPerMs, width }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/25 to-primary/5" />
              {track.kind === "video" && (
                <VideoComposeClipFilmstrip
                  sourceUrl={clip.sourceUrl}
                  trimStartMs={clip.trimStartMs}
                  trimEndMs={clip.trimEndMs}
                  width={width}
                />
              )}
              {track.kind === "audio" && (
                <VideoComposeClipWaveform
                  sourceUrl={clip.sourceUrl}
                  trimStartMs={clip.trimStartMs}
                  trimEndMs={clip.trimEndMs}
                  width={width}
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-media/45 via-transparent to-media/30" />
              <div className="absolute inset-0 flex flex-col justify-between p-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate rounded bg-media/50 px-1 text-[10px] text-media-foreground">
                    {clip.speed !== 1
                      ? `${t("videoCompose.speedPrefix")} ${clip.speed.toFixed(2)}X `
                      : ""}
                    {clip.displayName || t(`videoCompose.kind.${track.kind}`)}{" "}
                    {formatTimecode(clipLengthMs(clip))}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => onToggleMute(clip.id, !clip.muted)}
                      className="rounded bg-media/50 p-0.5 text-media-foreground/80 hover:text-media-foreground"
                      aria-label={
                        clip.muted
                          ? t("videoCompose.unmute")
                          : t("videoCompose.mute")
                      }
                    >
                      {clip.muted ? (
                        <VolumeX className="h-3 w-3" />
                      ) : (
                        <Volume2 className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => onMoveToNewTrack(track.id, clip.id)}
                      className="rounded bg-media/50 p-0.5 text-media-foreground/80 hover:text-media-foreground"
                      aria-label={t("videoCompose.moveToNewTrack")}
                      title={t("videoCompose.moveToNewTrack")}
                    >
                      <Rows3 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
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
              <div
                className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-transparent transition-colors hover:bg-media-foreground/30"
                onPointerDown={(event) =>
                  onTrim(event, track, clip, "start")
                }
              />
              <div
                className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-transparent transition-colors hover:bg-media-foreground/30"
                onPointerDown={(event) => onTrim(event, track, clip, "end")}
              />
            </div>
          );
        })}

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
              <VideoComposeClipFilmstrip
                sourceUrl={ghostClip.sourceUrl}
                trimStartMs={ghostClip.trimStartMs}
                trimEndMs={ghostClip.trimEndMs}
                width={Math.max(24, clipLengthMs(ghostClip) * pxPerMs)}
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-media/45 via-transparent to-media/30" />
            <div className="absolute inset-x-1 top-1">
              <span className="truncate rounded bg-media/55 px-1 text-[10px] text-media-foreground">
                {ghostClip.displayName ||
                  t(`videoCompose.kind.${track.kind}`)}{" "}
                {formatTimecode(clipLengthMs(ghostClip))}
              </span>
            </div>
          </div>
        )}

        {ghostClip && ghostLeftPx != null && (
          <div
            className="pointer-events-none absolute top-0 z-40 -translate-y-[18px] rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-primary-foreground shadow"
            style={{ left: ghostLeftPx }}
          >
            {formatTimecode(ghostStartMs)}
          </div>
        )}

        {trimmingClip && (
          <div
            className="pointer-events-none absolute top-0 z-40 rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-primary-foreground shadow"
            style={{
              left:
                trimEdge === "end"
                  ? trimmingClip.timelineEndMs * pxPerMs
                  : trimmingClip.timelineStartMs * pxPerMs,
              transform:
                trimEdge === "end"
                  ? "translate(-100%, -18px)"
                  : "translate(0, -18px)",
            }}
          >
            {formatTimecode(clipLengthMs(trimmingClip.clip))}
          </div>
        )}
      </div>
    </div>
  );
}
