// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
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
}: {
  src: string;
  beatNum: number;
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
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await container.requestFullscreen?.();
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media/95 via-media/72 to-transparent px-3 pb-2 pt-10 opacity-100 transition-opacity group-hover:opacity-100">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(currentTime, duration || currentTime)}
          onChange={(event) => seek(Number(event.target.value))}
          className="mb-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-media-foreground/20 accent-media-foreground [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-media-foreground [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-media-foreground"
          style={{
            background: `linear-gradient(to right, currentColor 0%, currentColor ${progress}%, color-mix(in srgb, currentColor 22%, transparent) ${progress}%, color-mix(in srgb, currentColor 22%, transparent) 100%)`,
          }}
          aria-label={t("viewer.videoSeek", "视频进度")}
        />

        <div className="flex min-w-0 items-center gap-1.5">
          <VideoControlButton
            label={isPlaying ? t("common.pause", "暂停") : t("common.play", "播放")}
            onClick={togglePlayback}
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
          </VideoControlButton>

          <span className="shrink-0 text-[11px] tabular-nums text-media-foreground/90">
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
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
              className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-media-foreground/25 accent-media-foreground opacity-0 transition-all group-hover/volume:w-16 group-hover/volume:opacity-100 focus:w-16 focus:opacity-100 [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-media-foreground"
              aria-label={t("viewer.volume", "音量")}
            />
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-8 min-w-10 items-center justify-center rounded-md px-1.5 text-[11px] font-medium text-media-foreground/90 outline-none transition hover:bg-media-foreground/12 focus-visible:ring-2 focus-visible:ring-media-foreground/55"
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
              label={t("viewer.fullscreen", "全屏")}
              onClick={() => void enterFullscreen()}
            >
              <Maximize2 className="size-4" />
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

export function Seedance2MediaPreview({
  src,
  state,
}: {
  src: string | null;
  state: BeatStageState;
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
  return <BeatVideoPlayer src={src} beatNum={0} />;
}

export function Seedance2SummaryPill({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center rounded-full border px-2 text-[11px] leading-none",
        active
          ? "border-primary/35 bg-primary/[0.07] text-primary"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "mr-1.5 size-1.5 shrink-0 rounded-full",
          active ? "bg-primary" : "bg-muted-foreground/35",
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function Seedance2Field({
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

export function Seedance2Checkbox({
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
