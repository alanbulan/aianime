// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState, type ReactEventHandler, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { BeatStageState } from "@/modules/production/domain/beat-state";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function BeatVideoPlayer({
  src,
  beatNum,
  onLoadedMetadata,
}: {
  src: string;
  beatNum: number;
  onLoadedMetadata?: ReactEventHandler<HTMLVideoElement>;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const updateFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setPlaybackRate(1);
  }, [src, beatNum]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false));
      return;
    }
    video.pause();
  };

  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Number.isFinite(value) ? value : 0;
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const changeVolume = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const nextVolume = Math.min(1, Math.max(0, value));
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
  };

  const toggleMuted = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const changePlaybackRate = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const enterPictureInPicture = async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }
    if (video.readyState > 0 && video.requestPictureInPicture) {
      await video.requestPictureInPicture();
    }
  };

  const enterFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await container.requestFullscreen?.();
    } catch {
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="group relative h-full min-h-0 w-full overflow-hidden bg-media text-media-foreground"
      data-testid="beat-video-player"
    >
      <video
        ref={videoRef}
        key={beatNum}
        src={src}
        playsInline
        preload="metadata"
        disableRemotePlayback
        controlsList="nodownload noremoteplayback"
        className="h-full w-full cursor-pointer object-contain"
        onClick={togglePlayback}
        onDoubleClick={() => void enterFullscreen()}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
          setPlaybackRate(event.currentTarget.playbackRate);
          onLoadedMetadata?.(event);
        }}
        onDurationChange={(event) =>
          setDuration(event.currentTarget.duration || 0)
        }
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onRateChange={(event) =>
          setPlaybackRate(event.currentTarget.playbackRate)
        }
        onEnded={() => setIsPlaying(false)}
      />

      {!isPlaying ? (
        <button
          type="button"
          onClick={togglePlayback}
          className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-media-foreground/15 bg-media/65 text-media-foreground shadow-xl backdrop-blur transition hover:scale-105 hover:bg-media/80"
          aria-label={t("common.play", "播放")}
        >
          <Play className="ml-0.5 size-5 fill-current" />
        </button>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media/95 via-media/72 to-transparent px-2 pb-2 pt-10 opacity-100 transition-opacity group-hover:opacity-100">
        <Slider
          min={0}
          max={duration || 1}
          step={0.01}
          value={[Math.min(currentTime, duration || 0)]}
          disabled={duration <= 0}
          onValueChange={([value]) => seek(value ?? 0)}
          className="mb-2 w-full"
          trackClassName="h-1 bg-media-foreground/20"
          rangeClassName="bg-media-foreground/90"
          thumbClassName="size-3 border-0 bg-media-foreground"
          aria-label={t("viewer.videoSeek", "视频进度")}
        />

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <VideoControlButton
            label={isPlaying ? t("common.pause", "暂停") : t("common.play", "播放")}
            onClick={togglePlayback}
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
          </VideoControlButton>

          <span className="max-w-full truncate text-[11px] tabular-nums text-media-foreground/90">
            {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
          </span>

          <div className="group/volume ml-1 flex items-center gap-1">
            <VideoControlButton
              label={muted ? t("viewer.unmute", "取消静音") : t("viewer.mute", "静音")}
              onClick={toggleMuted}
            >
              {muted || volume === 0 ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </VideoControlButton>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[muted ? 0 : volume]}
              onValueChange={([value]) => changeVolume(value ?? 0)}
              className="w-0 opacity-0 transition-all group-hover/volume:w-16 group-hover/volume:opacity-100 focus-within:w-16 focus-within:opacity-100"
              trackClassName="h-1 bg-media-foreground/25"
              rangeClassName="bg-media-foreground/90"
              thumbClassName="size-2.5 border-0 bg-media-foreground"
              aria-label={t("viewer.volume", "音量")}
            />
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-8 min-w-9 items-center justify-center rounded-md px-1.5 text-[11px] font-medium text-media-foreground/90 outline-none transition hover:bg-media-foreground/12 focus-visible:ring-2 focus-visible:ring-media-foreground/55"
                aria-label={t("viewer.playbackRate", "播放速度")}
              >
                {playbackRate}×
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                className="min-w-24"
              >
                {PLAYBACK_RATES.map((rate) => (
                  <DropdownMenuItem
                    key={rate}
                    onClick={() => changePlaybackRate(rate)}
                    className="flex items-center justify-between"
                  >
                    <span>{rate}×</span>
                    {playbackRate === rate ? <Check className="size-3.5" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <VideoControlButton
              label={t("viewer.pictureInPicture", "画中画")}
              onClick={() => void enterPictureInPicture()}
            >
              <PictureInPicture2 className="size-4" />
            </VideoControlButton>
            <VideoControlButton
              label={
                isFullscreen
                  ? t("viewer.exitFullscreen", "退出全屏")
                  : t("viewer.fullscreen", "全屏")
              }
              onClick={() => void enterFullscreen()}
            >
              {isFullscreen ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </VideoControlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-media-foreground/90 transition hover:bg-media-foreground/12 hover:text-media-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-media-foreground/55"
      aria-label={label}
      data-ui-tooltip={label}
    >
      {children}
    </button>
  );
}

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function VideoReferenceMediaPreview({
  src,
  state,
  onLoadedMetadata,
}: {
  src: string | null;
  state: BeatStageState;
  onLoadedMetadata?: ReactEventHandler<HTMLVideoElement>;
}) {
  const { t } = useTranslation();
  if (!src) {
    return (
      <span className="px-3 text-center text-xs text-muted-foreground">
        {state === "generating"
          ? t("episode.workbench.video.generating")
          : t("episode.workbench.video.previewMissing.video")}
      </span>
    );
  }
  return <BeatVideoPlayer src={src} beatNum={0} onLoadedMetadata={onLoadedMetadata} />;
}

export function VideoReferenceSummaryPill({
  active,
  attention = false,
  detail,
  label,
}: {
  active: boolean;
  attention?: boolean;
  detail?: string;
  label: string;
}) {
  return (
    <span
      data-ui-tooltip={detail || undefined}
      className={cn(
        "inline-flex h-5 max-w-full items-center rounded-full border px-2 text-[11px] leading-none",
        attention
          ? "border-destructive/35 bg-destructive/[0.07] text-destructive"
          : active
          ? "border-primary/35 bg-primary/[0.07] text-primary"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "mr-1.5 size-1.5 shrink-0 rounded-full",
          attention
            ? "bg-destructive"
            : active
              ? "bg-primary"
              : "bg-muted-foreground/35",
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function VideoReferenceField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[10px] text-muted-foreground/78">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function VideoParamField({
  label,
  htmlFor,
  hiddenLabel = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  hiddenLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {hiddenLabel ? (
        <span aria-hidden className="h-3.5 text-[10px] leading-[14px]">
          &nbsp;
        </span>
      ) : (
        <Label
          htmlFor={htmlFor}
          className="h-3.5 text-[10px] leading-[14px] text-muted-foreground/78"
        >
          {label}
        </Label>
      )}
      {children}
    </div>
  );
}

export function VideoReferenceCheckbox({
  id,
  checked,
  label,
  onChange,
}: {
  id: string;
  checked: boolean;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <label htmlFor={id} className="cursor-pointer">
        {label}
      </label>
    </div>
  );
}
